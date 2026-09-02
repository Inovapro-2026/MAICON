"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import {
  useMicrophone,
  micErrorAction,
  MicDiagnostic,
} from "@/hooks/use-microphone";

import { StarField } from "./star-field";
import { VoiceOrb, VoiceState } from "./voice-orb";
import { AgentHeader } from "./agent-header";
import { AgentStatus } from "./agent-status";
import { ConversationList, ChatMessage } from "./conversation-bubble";
import { VoiceControls } from "./voice-controls";
import { ConnectionStatus } from "./connection-status";
import { LanguageSelector } from "./language-selector";

// --- Configurações Calibradas de VAD (Detecção de Atividade de Voz) ---
// Limiar de energia (RMS) para detectar voz humana real (calibrado para microfones comuns e sensíveis)
const VOICE_THRESHOLD = 0.007;
// Janela de silêncio contínuo necessária para considerar a fala finalizada (1.4 segundos)
const SILENCE_MS = 1400;
// Intervalo de verificação do VAD em milissegundos
const VAD_INTERVAL_MS = 100;
// Quantidade mínima de frames com voz (> VOICE_THRESHOLD) antes de aceitar encerramento por silêncio (~200ms)
const MIN_VOICED_FRAMES = 2;
// Duração máxima de captura contínua antes de encerrar automaticamente por segurança (20s)
const MAX_RECORDING_MS = 20000;

export function AgentTab() {
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
        const utterance = new SpeechSynthesisUtterance(text);
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

  // Padrões de ruído sem fala real
  const NOISE_ONLY_PATTERN = /^[\s.,!?;:…'"()\-–—]+$/;

  const processAudio = useCallback(async () => {
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

      if (!res.ok || !data.success) {
        await speak("Desculpa, não consegui entender. Pode repetir?");
        if (sessionActiveRef.current) resumeListeningRef.current?.();
        return;
      }

      const userText = (data.data?.text ?? "").trim();
      console.log("[SAVYRON STT] Transcrição recebida:", userText);

      if (!userText || NOISE_ONLY_PATTERN.test(userText)) {
        // Silêncio ou ruído sem palavras — volta a ouvir suavemente
        if (sessionActiveRef.current) resumeListeningRef.current?.();
        return;
      }

      setTranscript(userText);
      const nextHistory: ChatMessage[] = [
        ...historyRef.current,
        { role: "user", content: userText },
      ].slice(-20);
      historyRef.current = nextHistory;
      setHistory(nextHistory);

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
      if (!chatRes.ok || !chatData.success) {
        await speak(
          "Tive um problema ao processar sua solicitação. Tenta de novo em instantes.",
        );
        if (sessionActiveRef.current) resumeListeningRef.current?.();
        return;
      }

      const reply = (chatData.data?.text ?? "").trim();
      if (!reply) {
        await speak(
          "Tive um problema ao processar sua solicitação. Tenta de novo em instantes.",
        );
        if (sessionActiveRef.current) resumeListeningRef.current?.();
        return;
      }

      const finalHistory: ChatMessage[] = [
        ...historyRef.current,
        { role: "assistant", content: reply },
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
    status === "error" && errorInfo && !micDiagnostic?.available;

  const micDisabled =
    micDiagnostic?.permission === "unsupported" ||
    micDiagnostic?.permission === "insecure";

  return (
    <div className="agent-page-viewport relative flex flex-col justify-between min-h-screen w-full">
      {/* 1. Fundo Espacial com Estrelas e Nebulosa */}
      <StarField />

      {/* 2. Header Integrado no Tema Escuro */}
      <AgentHeader />

      {/* 3. Conteúdo Principal */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center max-w-4xl mx-auto w-full px-4 pt-2 pb-2">
        {micDisabled && status !== "error" ? (
          <MicUnsupported
            diagnostic={micDiagnostic}
            onRetry={() => void refresh()}
          />
        ) : (
          <>
            {/* Voice Orb Neon Central */}
            <VoiceOrb
              state={status}
              audioLevel={audioLevel}
              frequencyData={frequencyData}
              onClick={() => void handlePress()}
            />

            {/* Texto de Status */}
            <AgentStatus state={status} sessionActive={sessionActive} />

            {/* Card de Erro Específico com Orientação */}
            {showErrorCard && errorInfo && (
              <div className="mt-6 w-full max-w-sm rounded-2xl border border-red-500/30 bg-red-950/40 p-5 text-center backdrop-blur-md shadow-xl">
                <div className="text-sm font-semibold text-red-300">
                  {errorInfo.title}
                </div>
                <p className="mt-1 text-xs text-red-400">{errorInfo.message}</p>
                <div className="mt-4 flex justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleRetry()}
                    className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {errorInfo.actionLabel}
                  </button>
                </div>
              </div>
            )}

            {/* Fallback indicador: Voz do navegador */}
            {usingBrowserVoice && status !== "error" && (
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full agent-glass-card px-3 py-1 text-[11px] font-medium text-amber-300">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                Voz do navegador (fallback)
              </div>
            )}

            {/* Conversa em Glassmorphism */}
            <ConversationList
              history={history}
              transcript={transcript}
              lastAssistant={lastAssistant}
            />

            {/* Controles de Voz (Microfone, Mute, Encerrar) */}
            <div className="mt-4 w-full">
              <VoiceControls
                state={status}
                sessionActive={sessionActive}
                isMuted={isMuted}
                audioLevel={audioLevel}
                onToggleMute={toggleMute}
                onToggleMic={handlePress}
                onEndCall={stopSession}
                disabled={micDisabled}
              />
            </div>
          </>
        )}
      </div>

      {/* 4. Barra Inferior com Indicadores (Status de Conexão + Idioma) */}
      <div className="relative z-10 flex items-center justify-between w-full px-4 sm:px-8 py-3 border-t border-white/5 text-xs">
        <ConnectionStatus state={status} sessionActive={sessionActive} />
        <LanguageSelector />
      </div>
    </div>
  );
}

/** Bloco exibido quando o navegador/contexto não suporta captura de áudio. */
function MicUnsupported({
  diagnostic,
  onRetry,
}: {
  diagnostic: MicDiagnostic | null;
  onRetry: () => void;
}) {
  const info = diagnostic ? micErrorAction(diagnostic) : null;
  return (
    <div className="max-w-sm rounded-2xl agent-glass-card p-6 text-center text-sm text-amber-200 shadow-2xl">
      <div className="text-base font-semibold text-amber-300">
        {info?.title ?? "Acesso ao microfone indisponível"}
      </div>
      <p className="mt-2 text-xs text-amber-200/80 leading-relaxed">
        {info?.message ??
          "O acesso ao microfone exige um navegador atualizado e uma conexão segura (HTTPS)."}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700 transition-colors cursor-pointer"
      >
        <RotateCcw className="h-4 w-4" /> Verificar novamente
      </button>
    </div>
  );
}
