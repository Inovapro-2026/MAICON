"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { useMicrophone, micErrorAction } from "@/hooks/use-microphone";
import type { MicDiagnostic } from "@/hooks/use-microphone";

import { VoiceState } from "./agent-visual-state";
import type { ChatMessage } from "./conversation-bubble";
import {
  VOICE_THRESHOLD,
  SILENCE_MS,
  VAD_INTERVAL_MS,
  MIN_VOICED_FRAMES,
  MAX_RECORDING_MS,
  NOISE_ONLY_PATTERN,
  normalizeForTTS,
  sanitizeAgentReply,
} from "./engine-utils";

export interface AgentConversationResult {
  status: VoiceState;
  sessionActive: boolean;
  isMuted: boolean;
  audioLevel: number;
  frequencyData: number[];
  micDiagnostic: MicDiagnostic | null;
  transcript: string;
  history: ChatMessage[];
  lastAssistant: string;
  usingBrowserVoice: boolean;
  micDisabled: boolean;
  showErrorCard: boolean;
  errorInfo: ReturnType<typeof micErrorAction> | null;
  handlePress: () => void;
  handleRetry: () => void;
  stopSession: () => void;
  toggleMute: () => void;
  refresh: () => void;
}

/**
 * Motor conversacional compartilhado do Agente (V1 e V2).
 *
 * Extraído integralmente do agent-tab.tsx (FASE 4) e estendido com:
 * - sessão requestId (`sessionTokenRef`): impede que respostas STT/chat/TTS de
 *   uma sessão antiga sobrescrevam estado visual/transcrição de uma sessão nova;
 * - estado derivado `agent-thinking` antes da chamada de chat (LLM/Funções),
 *   mapeado para o núcleo MAICON como `thinking`.
 */
export function useAgentConversation(): AgentConversationResult {
  const { error: toastError } = useToast();
  const { diagnostic, requestPermission, refresh } = useMicrophone();

  // Estados principais
  const [status, setStatus] = useState<VoiceState>("idle");
  const [sessionActive, setSessionActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [frequencyData, setFrequencyData] = useState<number[]>([0.2, 0.3, 0.5, 0.7, 0.5, 0.3, 0.2]);

  const [micDiagnostic, setMicDiagnostic] = useState<MicDiagnostic | null>(null);
  const [transcript, setTranscript] = useState("");
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [lastAssistant, setLastAssistant] = useState("");
  const [usingBrowserVoice, setUsingBrowserVoice] = useState(false);

  // Refs de controle de áudio e gravação
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const historyRef = useRef<ChatMessage[]>([]);
  const statusRef = useRef<VoiceState>("idle");
  const speakingRef = useRef(false);
  const sessionActiveRef = useRef(false);
  const isMutedRef = useRef(false);

  // Guard de sessão: incrementa a cada início/término; respostas em voo que
  // capturem um token antigo são descartadas (evita race STT/chat/TTS).
  const sessionTokenRef = useRef(0);

  // Web Audio API para VAD e visualização em tempo real
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const ttsAnalyserRef = useRef<AnalyserNode | null>(null);
  const vadTimerRef = useRef<number | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const recordingStartTimeRef = useRef<number>(0);

  // Estatísticas da fala atual
  const vadStatsRef = useRef<{
    voicedFrames: number;
    totalFrames: number;
    peakRms: number;
  }>({ voicedFrames: 0, totalFrames: 0, peakRms: 0 });

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    sessionActiveRef.current = sessionActive;
  }, [sessionActive]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    if (diagnostic) setMicDiagnostic(diagnostic);
  }, [diagnostic]);

  // Limpeza completa ao desmontar o componente
  useEffect(() => {
    return () => {
      sessionActiveRef.current = false;
      stopVad();
      stopPlayback();
      stopStream();
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      if (audioContextRef.current) {
        void audioContextRef.current.close().catch(() => undefined);
        audioContextRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
  }, []);

  const stopVad = useCallback(() => {
    if (vadTimerRef.current !== null) {
      window.clearInterval(vadTimerRef.current);
      vadTimerRef.current = null;
    }
  }, []);

  const resumeAudioContext = useCallback(async () => {
    if (
      audioContextRef.current &&
      audioContextRef.current.state === "suspended"
    ) {
      await audioContextRef.current.resume();
    }
  }, []);

  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    speakingRef.current = false;
  }, []);

  /** Loop de animação contínua de áudio (60fps) */
  const startAudioMeter = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
    }

    const updateMeter = () => {
      const isSpeakingTTS = speakingRef.current;
      const targetAnalyser = isSpeakingTTS
        ? ttsAnalyserRef.current || analyserRef.current
        : analyserRef.current;

      if (targetAnalyser && audioContextRef.current?.state === "running") {
        const floatData = new Float32Array(targetAnalyser.fftSize);
        targetAnalyser.getFloatTimeDomainData(floatData);

        let sum = 0;
        for (let i = 0; i < floatData.length; i++) {
          sum += floatData[i] * floatData[i];
        }
        const rms = Math.sqrt(sum / floatData.length);
        const normalizedLevel = Math.min(1, rms * 8);
        setAudioLevel(normalizedLevel);

        // Frequências para barras centrais
        const freqData = new Uint8Array(targetAnalyser.frequencyBinCount);
        targetAnalyser.getByteFrequencyData(freqData);
        const step = Math.floor(freqData.length / 8);
        const bars: number[] = [];
        for (let i = 1; i <= 7; i++) {
          const val = freqData[i * step] / 255;
          bars.push(val);
        }
        setFrequencyData(bars);
      } else {
        setAudioLevel((prev) => Math.max(0, prev * 0.85));
      }

      animFrameRef.current = requestAnimationFrame(updateMeter);
    };

    animFrameRef.current = requestAnimationFrame(updateMeter);
  }, []);

  /** Fallback: Fala usando síntese nativa do navegador (Web Speech API) */
  const speakWithBrowser = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        resolve();
        return;
      }
      try {
        const utterance = new SpeechSynthesisUtterance(normalizeForTTS(text));
        utterance.lang = "pt-BR";
        utterance.rate = 1;
        utterance.pitch = 1;
        const voices = window.speechSynthesis.getVoices();
        const ptVoice =
          voices.find((v) => v.lang?.toLowerCase().startsWith("pt")) ?? null;
        if (ptVoice) utterance.voice = ptVoice;

        speakingRef.current = true;
        setUsingBrowserVoice(true);
        setStatus("agent-speaking");

        utterance.onend = () => {
          speakingRef.current = false;
          resolve();
        };
        utterance.onerror = () => {
          speakingRef.current = false;
          resolve();
        };
        window.speechSynthesis.speak(utterance);
      } catch {
        speakingRef.current = false;
        resolve();
      }
    });
  }, []);

  /** Reproduz áudio TTS (ElevenLabs com fallback para navegador) */
  const speak = useCallback(
    async (text: string): Promise<void> => {
      const token = sessionTokenRef.current;
      if (speakingRef.current) return;
      try {
        const res = await fetch("/api/proxy/agent/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });

        const contentType = res.headers.get("content-type") ?? "";
        if (!res.ok || contentType.includes("application/json")) {
          await speakWithBrowser(text);
          return;
        }

        const blob = await res.blob();
        if (token !== sessionTokenRef.current) {
          URL.revokeObjectURL(URL.createObjectURL(blob));
          return;
        }
        const url = URL.createObjectURL(blob);
        await new Promise<void>((resolve) => {
          const audio = new Audio(url);
          audioRef.current = audio;
          speakingRef.current = true;
          setUsingBrowserVoice(false);
          setStatus("agent-speaking");

          // Conecta o áudio do TTS ao analisador para fazer o VoiceOrb reagir ao som da IA
          if (audioContextRef.current && audioContextRef.current.state === "running") {
            try {
              const ttsSource = audioContextRef.current.createMediaElementSource(audio);
              const ttsAnalyser = audioContextRef.current.createAnalyser();
              ttsAnalyser.fftSize = 256;
              ttsSource.connect(ttsAnalyser);
              ttsAnalyser.connect(audioContextRef.current.destination);
              ttsAnalyserRef.current = ttsAnalyser;
            } catch {
              // noop se já conectado
            }
          }

          audio.onended = () => {
            speakingRef.current = false;
            URL.revokeObjectURL(url);
            resolve();
          };
          audio.onerror = () => {
            speakingRef.current = false;
            URL.revokeObjectURL(url);
            void speakWithBrowser(text);
            resolve();
          };
          void audio.play();
        });
      } catch {
        await speakWithBrowser(text);
      }
    },
    [speakWithBrowser],
  );

  /** Encerra fala do usuário e envia gravação para processamento */
  const finishUtterance = useCallback(() => {
    stopVad();
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === "recording") {
      recorder.stop();
    }
  }, [stopVad]);

  /** Loop VAD calibrado com Float32Array */
  const startVad = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    stopVad();

    vadStatsRef.current = { voicedFrames: 0, totalFrames: 0, peakRms: 0 };
    recordingStartTimeRef.current = Date.now();
    const floatData = new Float32Array(analyser.fftSize);
    let silenceStart: number | null = null;

    const interval = window.setInterval(() => {
      if (isMutedRef.current) return;

      analyser.getFloatTimeDomainData(floatData);
      let sum = 0;
      for (let i = 0; i < floatData.length; i++) {
        sum += floatData[i] * floatData[i];
      }
      const rms = Math.sqrt(sum / floatData.length);
      const stats = vadStatsRef.current;
      stats.totalFrames += 1;

      // Telemetria detalhada no console para diagnóstico de voz
      if (stats.totalFrames % 5 === 0 && rms > 0.003) {
        console.log("[SAVYRON VAD]", {
          rms: rms.toFixed(4),
          peakRms: stats.peakRms.toFixed(4),
          voicedFrames: stats.voicedFrames,
          status: statusRef.current,
        });
      }

      if (rms > VOICE_THRESHOLD) {
        stats.voicedFrames += 1;
        if (rms > stats.peakRms) stats.peakRms = rms;
        silenceStart = null;

        // Atualiza estado visual para fala do usuário
        if (statusRef.current === "listening") {
          setStatus("user-speaking");
        }
      } else {
        if (silenceStart === null) silenceStart = Date.now();

        // Se o usuário falou o suficiente e fez pausa, encerra e processa
        if (
          stats.voicedFrames >= MIN_VOICED_FRAMES &&
          Date.now() - silenceStart >= SILENCE_MS
        ) {
          console.log("[SAVYRON VAD] Fim de fala detectado por silêncio:", {
            voicedFrames: stats.voicedFrames,
            peakRms: stats.peakRms,
          });
          finishUtterance();
          return;
        }

        // Volta visualmente para "listening" durante pausas curtas
        if (statusRef.current === "user-speaking" && stats.voicedFrames === 0) {
          setStatus("listening");
        }
      }

      // Watchdog de segurança: encerra gravação se ultrapassar o tempo máximo
      if (Date.now() - recordingStartTimeRef.current >= MAX_RECORDING_MS) {
        if (stats.voicedFrames >= MIN_VOICED_FRAMES) {
          finishUtterance();
        } else {
          // Apenas silêncio por 20s — reinicia a janela de gravação sem travar
          vadStatsRef.current = { voicedFrames: 0, totalFrames: 0, peakRms: 0 };
          recordingStartTimeRef.current = Date.now();
        }
      }
    }, VAD_INTERVAL_MS);

    vadTimerRef.current = interval;
  }, [finishUtterance, stopVad]);

  /** Volta para o estado OUVINDO em modo contínuo */
  const resumeListeningRef = useRef<() => void>(() => undefined);

  const processAudio = useCallback(async () => {
    const token = sessionTokenRef.current;
    if (audioChunksRef.current.length === 0) {
      if (sessionActiveRef.current) resumeListeningRef.current?.();
      return;
    }

    const stats = vadStatsRef.current;
    console.log("[SAVYRON VAD] Processando áudio capturado:", {
      chunks: audioChunksRef.current.length,
      voicedFrames: stats.voicedFrames,
      peakRms: stats.peakRms,
    });

    // Se não houve quase nenhuma fala detectada (ruído ambiente puro), não envia
    if (stats.voicedFrames < 1) {
      audioChunksRef.current = [];
      if (sessionActiveRef.current) resumeListeningRef.current?.();
      return;
    }

    setStatus("processing");
    try {
      const blob = new Blob(audioChunksRef.current, {
        type: mediaRecorderRef.current?.mimeType || "audio/webm",
      });
      const form = new FormData();
      form.append("audio", blob, "recording.webm");

      const res = await fetch("/api/proxy/agent/transcribe", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (token !== sessionTokenRef.current) return;

      if (!res.ok || !data.success) {
        await speak("Desculpa, não consegui entender. Pode repetir?");
        if (sessionActiveRef.current) resumeListeningRef.current?.();
        return;
      }

      const userText = String((data.data?.text ?? "")).trim();
      console.log("[SAVYRON STT] Transcrição recebida:", userText);

      if (!userText || NOISE_ONLY_PATTERN.test(userText)) {
        // Silêncio ou ruído sem palavras — volta a ouvir suavemente
        if (sessionActiveRef.current) resumeListeningRef.current?.();
        return;
      }

      setTranscript(userText);
      const nextHistory: ChatMessage[] = [
        ...historyRef.current,
        { role: "user" as const, content: userText },
      ].slice(-20);
      historyRef.current = nextHistory;
      setHistory(nextHistory);

      // Raciocínio do agente (LLM + Function Calling) — núcleo em "thinking"
      setStatus("agent-thinking");

      // Chamada LLM + Function Calling
      const chatRes = await fetch("/api/proxy/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: userText,
          history: nextHistory.slice(0, -1),
        }),
      });

      const chatData = await chatRes.json();
      if (token !== sessionTokenRef.current) return;
      if (!chatRes.ok || !chatData.success) {
        await speak(
          "Tive um problema ao processar sua solicitação. Tenta de novo em instantes.",
        );
        if (sessionActiveRef.current) resumeListeningRef.current?.();
        return;
      }

      const reply = sanitizeAgentReply(chatData.data?.text ?? "");
      if (!reply) {
        await speak(
          "Tive um problema ao processar sua solicitação. Tenta de novo em instantes.",
        );
        if (sessionActiveRef.current) resumeListeningRef.current?.();
        return;
      }

      const finalHistory: ChatMessage[] = [
        ...historyRef.current,
        { role: "assistant" as const, content: reply },
      ].slice(-20);
      historyRef.current = finalHistory;
      setHistory(finalHistory);
      setLastAssistant(reply);

      await speak(reply);

      // Retoma a escuta automaticamente após a fala do agente
      if (sessionActiveRef.current) resumeListeningRef.current?.();
    } catch (err) {
      console.error("[SAVYRON AGENTE Erro no processamento]", err);
      await speak(
        "Tive um problema ao processar sua solicitação. Tenta de novo em instantes.",
      );
      if (sessionActiveRef.current) resumeListeningRef.current?.();
    }
  }, [speak]);

  /** Retoma a escuta no modo contínuo */
  const resumeListening = useCallback(() => {
    if (!streamRef.current || !sessionActiveRef.current) return;
    setStatus("listening");
    setTranscript("");
    audioChunksRef.current = [];
    vadStatsRef.current = { voicedFrames: 0, totalFrames: 0, peakRms: 0 };

    const recorder = new MediaRecorder(streamRef.current);
    mediaRecorderRef.current = recorder;
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      if (sessionActiveRef.current) void processAudio();
    };
    recorder.start();
    void resumeAudioContext();
    startVad();
  }, [resumeAudioContext, startVad, processAudio]);

  resumeListeningRef.current = resumeListening;

  /** Inicia a sessão de conversa */
  const beginListening = useCallback(async () => {
    sessionTokenRef.current += 1;
    const token = sessionTokenRef.current;

    setStatus("connecting");
    setSessionActive(true);
    sessionActiveRef.current = true;
    setTranscript("");
    audioChunksRef.current = [];
    vadStatsRef.current = { voicedFrames: 0, totalFrames: 0, peakRms: 0 };

    try {
      if (!streamRef.current) {
        const diag = await requestPermission();
        setMicDiagnostic(diag);
        if (token !== sessionTokenRef.current) return;
        if (!diag.available || diag.permission === "denied") {
          setSessionActive(false);
          sessionActiveRef.current = false;
          setStatus("error");
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        if (token !== sessionTokenRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        const ctx = new AudioCtx();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);

        audioContextRef.current = ctx;
        analyserRef.current = analyser;
      }

      await resumeAudioContext();
      if (token !== sessionTokenRef.current) return;
      startAudioMeter();

      setStatus("listening");
      const recorder = new MediaRecorder(streamRef.current);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        if (sessionActiveRef.current) void processAudio();
      };
      recorder.start();
      startVad();
    } catch (error) {
      if (token !== sessionTokenRef.current) return;
      const diag = micErrorAction(
        micDiagnostic ?? {
          available: false,
          permission: "unknown",
          reason: "Não foi possível acessar o microfone.",
          errorCode: "UNKNOWN",
        },
      );
      setMicDiagnostic({
        available: false,
        permission: "unknown",
        reason: diag.message,
        errorCode:
          (error as DOMException)?.name === "NotAllowedError"
            ? "NOT_ALLOWED"
            : (error as DOMException)?.name === "NotFoundError"
              ? "NOT_FOUND"
              : (error as DOMException)?.name === "NotReadableError"
                ? "NOT_READABLE"
                : "UNKNOWN",
      });
      setSessionActive(false);
      sessionActiveRef.current = false;
      setStatus("error");
      toastError("Não foi possível acessar o microfone.");
    }
  }, [
    requestPermission,
    toastError,
    micDiagnostic,
    resumeAudioContext,
    startAudioMeter,
    processAudio,
    startVad,
  ]);

  /** Encerra a sessão imediatamente */
  const stopSession = useCallback(() => {
    sessionTokenRef.current += 1;
    setSessionActive(false);
    sessionActiveRef.current = false;
    stopVad();
    stopPlayback();

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === "recording") {
      try {
        recorder.stop();
      } catch {
        /* noop */
      }
    }
    stopStream();

    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
      analyserRef.current = null;
    }

    setStatus("idle");
    setTranscript("");
    setIsMuted(false);
  }, [stopVad, stopPlayback, stopStream]);

  /** Alterna mudo do microfone */
  const toggleMute = useCallback(() => {
    if (!streamRef.current) return;
    const nextMuted = !isMuted;
    streamRef.current.getAudioTracks().forEach((t) => {
      t.enabled = !nextMuted;
    });
    setIsMuted(nextMuted);
  }, [isMuted]);

  /** Clique no botão central do microfone */
  const handlePress = useCallback(() => {
    if (!sessionActiveRef.current) {
      void beginListening();
    } else {
      stopSession();
    }
  }, [beginListening, stopSession]);

  const handleRetry = useCallback(() => {
    void beginListening();
  }, [beginListening]);

  // Tratamento de erros de microfone
  const errorInfo = micDiagnostic ? micErrorAction(micDiagnostic) : null;
  const showErrorCard =
    status === "error" && !!errorInfo && !micDiagnostic?.available;

  const micDisabled =
    micDiagnostic?.permission === "unsupported" ||
    micDiagnostic?.permission === "insecure";

  return {
    status,
    sessionActive,
    isMuted,
    audioLevel,
    frequencyData,
    micDiagnostic,
    transcript,
    history,
    lastAssistant,
    usingBrowserVoice,
    micDisabled,
    showErrorCard,
    errorInfo,
    handlePress,
    handleRetry,
    stopSession,
    toggleMute,
    refresh,
  };
}