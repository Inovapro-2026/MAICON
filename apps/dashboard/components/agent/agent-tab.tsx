"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Loader2, AudioLines, RotateCcw } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import {
  useMicrophone,
  micErrorAction,
  MicDiagnostic,
} from "@/hooks/use-microphone";

type AgentStatus = "idle" | "listening" | "processing" | "speaking" | "error";

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

const STATUS_LABEL: Record<AgentStatus, string> = {
  idle: "Toque para ligar",
  listening: "Ouvindo…",
  processing: "Pensando…",
  speaking: "Falando…",
  error: "Microfone indisponível",
};

// VAD: limiar de energia (RMS) e silêncio necessário para encerrar a fala.
const VOICE_THRESHOLD = 0.012;
// Janela de silêncio exigida para considerar a fala encerrada. Valor maior
// evita cortar pausas naturais no meio de frases (respiração, hesitação).
const SILENCE_MS = 1800;
const VAD_INTERVAL_MS = 150;
// Duração mínima de fala real antes que silêncio possa contar como "fim" —
// impede que uma pausa logo no início da frase seja lida como encerramento.
const MIN_SPEECH_MS = 350;
// Validação anti-falso-positivo (processamento de silêncio/ruído):
// - duração mínima de fala capturada (voiced frames × intervalo);
// - pico de energia (RMS) mínimo — descarta silêncio e ruído de fundo baixo.
const MIN_REAL_SPEECH_MS = 350;
const MIN_PEAK_RMS = 0.02;

export function AgentTab() {
  const { error: toastError } = useToast();
  const { diagnostic, requestPermission, refresh } = useMicrophone();
  const [status, setStatus] = useState<AgentStatus>("idle");
  const [micDiagnostic, setMicDiagnostic] = useState<MicDiagnostic | null>(
    null,
  );
  const [transcript, setTranscript] = useState("");
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [lastAssistant, setLastAssistant] = useState("");
  const [usingBrowserVoice, setUsingBrowserVoice] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const historyRef = useRef<ChatTurn[]>([]);
  const statusRef = useRef<AgentStatus>("idle");
  const speakingRef = useRef(false);

  // Modo contínuo — ciclo ligado/desligado + VAD.
  const sessionActiveRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadTimerRef = useRef<number | null>(null);
  // Estatísticas de energia coletadas pelo VAD na janela de gravação atual.
  // Usadas para validar que houve FALA REAL antes de chamar STT/LLM.
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

  // Acompanha o diagnóstico inicial do hook (sem solicitar permissão).
  useEffect(() => {
    if (diagnostic) setMicDiagnostic(diagnostic);
  }, [diagnostic]);

  // Cleanup ao desmontar / sair da aba: encerra a sessão e libera o microfone.
  useEffect(() => {
    return () => {
      sessionActiveRef.current = false;
      stopVad();
      stopPlayback();
      stopStream();
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

  /** Interrompe o loop de VAD e "surdеia" o contexto de áudio (PROCESSING/FALANDO). */
  const stopVad = useCallback(() => {
    if (vadTimerRef.current !== null) {
      window.clearInterval(vadTimerRef.current);
      vadTimerRef.current = null;
    }
    if (
      audioContextRef.current &&
      audioContextRef.current.state === "running"
    ) {
      void audioContextRef.current.suspend();
    }
  }, []);

  /** Retoma o contexto de áudio antes de voltar a ouvir. */
  const resumeAudioContext = useCallback(async () => {
    if (
      audioContextRef.current &&
      audioContextRef.current.state === "suspended"
    ) {
      await audioContextRef.current.resume();
    }
  }, []);

  /** Para qualquer reprodução de áudio (TTS) em andamento. */
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

  /** Fala usando a síntese nativa do navegador (fallback quando ElevenLabs falha). */
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
        setStatus("speaking");

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
          // Falha ou fallback sinalizado pelo backend → voz nativa do navegador
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
          setStatus("speaking");
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

  /** Encerra a fala do usuário: para o VAD e processa o áudio capturado. */
  const finishUtterance = useCallback(() => {
    stopVad();
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === "recording") {
      recorder.stop();
    }
  }, [stopVad]);

  /** Loop de VAD: monitora a energia do áudio e detecta o fim da fala. */
  const startVad = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    stopVad();
    vadStatsRef.current = { voicedFrames: 0, totalFrames: 0, peakRms: 0 };
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let silenceStart: number | null = null;

    const interval = window.setInterval(() => {
      analyser.getByteTimeDomainData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const v = (dataArray[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      const stats = vadStatsRef.current;
      stats.totalFrames += 1;
      if (rms > VOICE_THRESHOLD) {
        stats.voicedFrames += 1;
        if (rms > stats.peakRms) stats.peakRms = rms;
        silenceStart = null;
      } else {
        if (silenceStart === null) silenceStart = Date.now();
        // Só encerra a fala se já houver fala real suficiente capturada —
        // uma pausa logo no início da frase não pode ser lida como fim.
        const speechMs = stats.voicedFrames * VAD_INTERVAL_MS;
        if (
          speechMs >= MIN_SPEECH_MS &&
          Date.now() - silenceStart >= SILENCE_MS
        ) {
          finishUtterance();
        }
      }
    }, VAD_INTERVAL_MS);

    vadTimerRef.current = interval;
  }, [finishUtterance, stopVad]);

  /** Volta para o estado OUVINDO após a resposta (modo contínuo). */
  const resumeListeningRef = useRef<() => void>(() => undefined);

  // Padrões de transcrição sem conteúdo real (silêncio/ruído alucinado pelo
  // STT). Não passam para o LLM — só voltam a ouvir em silêncio.
  const NOISE_ONLY_PATTERN = /^[\s.,!?;:…'"()\-–—]+$/;

  const processAudio = useCallback(async () => {
    if (audioChunksRef.current.length === 0) {
      if (sessionActiveRef.current) resumeListeningRef.current?.();
      return;
    }

    // Validação de fala real ANTES de qualquer processamento (STT/LLM).
    // Sem duração mínima de fala nem pico de energia, o trecho capturado é
    // silêncio ou ruído baixo → descarta e volta a ouvir, sem resposta.
    const stats = vadStatsRef.current;
    const speechMs = stats.voicedFrames * VAD_INTERVAL_MS;
    if (speechMs < MIN_REAL_SPEECH_MS || stats.peakRms < MIN_PEAK_RMS) {
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
      if (!userText || NOISE_ONLY_PATTERN.test(userText)) {
        // Sem fala transcrita — volta a ouvir em silêncio, sem responder.
        if (sessionActiveRef.current) resumeListeningRef.current?.();
        return;
      }
      setTranscript(userText);
      const nextHistory = [
        ...historyRef.current,
        { role: "user" as const, content: userText },
      ].slice(-20);
      historyRef.current = nextHistory;
      setHistory(nextHistory);

      // LLM + function calling
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
      const finalHistory = [
        ...historyRef.current,
        { role: "assistant" as const, content: reply },
      ].slice(-20);
      historyRef.current = finalHistory;
      setHistory(finalHistory);
      setLastAssistant(reply);
      await speak(reply);

      // Modo contínuo: volta a ouvir automaticamente após a resposta.
      if (sessionActiveRef.current) resumeListeningRef.current?.();
    } catch {
      await speak(
        "Tive um problema ao processar sua solicitação. Tenta de novo em instantes.",
      );
      if (sessionActiveRef.current) resumeListeningRef.current?.();
    }
  }, [speak]);

  /** Volta para o estado OUVINDO — recria o recorder e inicia VAD. */
  const resumeListening = useCallback(() => {
    if (!streamRef.current) return;
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

  // Sincroniza o ref para evitar ciclo de dependência.
  resumeListeningRef.current = resumeListening;

  /**
   * Liga a sessão (primeiro toque). Cria o stream + Analyser para VAD e
   * começa a ouvir. Em chamadas seguintes dentro da sessão, reutiliza o stream.
   */
  const beginListening = useCallback(async () => {
    if (!sessionActiveRef.current) return;
    setStatus("listening");
    setTranscript("");
    audioChunksRef.current = [];
    vadStatsRef.current = { voicedFrames: 0, totalFrames: 0, peakRms: 0 };
    try {
      if (!streamRef.current) {
        const diag = await requestPermission();
        setMicDiagnostic(diag);
        if (!diag.available || diag.permission === "denied") {
          sessionActiveRef.current = false;
          setStatus("error");
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        streamRef.current = stream;

        // Analyser para VAD (energia do sinal de áudio).
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
      // AudioContext novo começa "suspended" — sem resume() o analyser devolve
      // silêncio e o VAD nunca detecta fala (fica preso em "Ouvindo…").
      await resumeAudioContext();

      const recorder = new MediaRecorder(streamRef.current);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        // Só processa se a sessão segue ligada (não processar ao desligar).
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
      sessionActiveRef.current = false;
      setStatus("error");
      toastError("Não foi possível acessar o microfone.");
    }
  }, [
    requestPermission,
    toastError,
    micDiagnostic,
    resumeAudioContext,
    processAudio,
    startVad,
  ]);

  /** Desliga a sessão imediatamente, em qualquer estado, liberando o microfone. */
  const stopSession = useCallback(() => {
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
  }, [stopVad, stopPlayback, stopStream]);

  const handlePress = useCallback(() => {
    if (!sessionActiveRef.current) {
      sessionActiveRef.current = true;
      void beginListening();
    } else {
      stopSession();
    }
  }, [beginListening, stopSession]);

  const handleRetry = useCallback(() => {
    sessionActiveRef.current = true;
    void beginListening();
  }, [beginListening]);

  // Estados de erro com orientação específica.
  const errorInfo = micDiagnostic ? micErrorAction(micDiagnostic) : null;
  const showErrorCard =
    status === "error" && errorInfo && !micDiagnostic?.available;

  const micDisabled =
    micDiagnostic?.permission === "unsupported" ||
    micDiagnostic?.permission === "insecure";

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4">
      {micDisabled && status !== "error" ? (
        <MicUnsupported
          diagnostic={micDiagnostic}
          onRetry={() => void refresh()}
        />
      ) : (
        <>
          <div className="relative flex items-center justify-center">
            {/* Ondas do estado "ouvindo" */}
            {status === "listening" ? (
              <div className="absolute flex h-64 items-center justify-center gap-1.5">
                {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                  <span
                    key={i}
                    className="agent-wave-bar w-1.5 rounded-full bg-[#6366F1]"
                    style={{ animationDelay: `${i * 0.12}s` }}
                  />
                ))}
              </div>
            ) : null}

            {/* Pulso do estado "falando" */}
            {status === "speaking" ? (
              <>
                <span className="absolute h-40 w-40 animate-ping rounded-full bg-[#6366F1]/15" />
                <span
                  className="absolute h-32 w-32 animate-ping rounded-full bg-[#6366F1]/10"
                  style={{ animationDelay: "0.3s" }}
                />
              </>
            ) : null}

            {/* Loader do estado "processando" */}
            {status === "processing" ? (
              <div className="absolute flex h-40 w-40 items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-[#6366F1]/70" />
              </div>
            ) : null}

            {/* Botão do microfone */}
            <button
              type="button"
              onClick={() => void handlePress()}
              disabled={micDisabled}
              aria-label={STATUS_LABEL[status]}
              title={
                sessionActiveRef.current
                  ? "Toque para desligar"
                  : "Toque para ligar"
              }
              className={`group relative z-10 flex h-28 w-28 items-center justify-center rounded-full shadow-xl transition-all duration-200 ${
                status === "listening"
                  ? "scale-105 bg-[#6366F1] shadow-[0_0_60px_rgba(99,102,241,0.5)]"
                  : status === "speaking"
                    ? "bg-[#10B981] shadow-[0_0_50px_rgba(16,185,129,0.4)]"
                    : status === "error"
                      ? "bg-[#EF4444] shadow-[0_0_40px_rgba(239,68,68,0.35)]"
                      : "bg-[#6366F1] hover:scale-105 hover:bg-[#4F46E5]"
              } disabled:cursor-not-allowed`}
            >
              {status === "listening" ? (
                <AudioLines className="h-11 w-11 animate-pulse text-white" />
              ) : status === "processing" ? (
                <Loader2 className="h-11 w-11 animate-spin text-white" />
              ) : status === "speaking" ? (
                <AudioLines className="h-11 w-11 text-white" />
              ) : status === "error" ? (
                <Mic className="h-11 w-11 text-white" />
              ) : (
                <Mic className="h-11 w-11 text-white" />
              )}
            </button>
          </div>

          <div className="mt-10 text-center">
            <div
              className={`text-lg font-semibold ${
                status === "listening"
                  ? "text-[#6366F1]"
                  : status === "speaking"
                    ? "text-[#10B981]"
                    : status === "error"
                      ? "text-[#EF4444]"
                      : "text-[#0F172A]"
              }`}
            >
              {STATUS_LABEL[status]}
            </div>
            <p className="mt-1 max-w-sm text-sm text-[#64748B]">
              {sessionActiveRef.current ? (
                <>
                  Converse à vontade — toque no microfone de novo para desligar.
                </>
              ) : (
                <>
                  Toque no microfone para ligar. Fale livremente: várias
                  perguntas em sequência, sem tocar de novo. Toque de novo para
                  desligar.
                </>
              )}
            </p>
          </div>

          {/* Card de erro específico com orientação */}
          {showErrorCard && errorInfo ? (
            <div className="mt-6 w-full max-w-sm rounded-2xl border border-red-200 bg-red-50 p-5 text-center">
              <div className="text-sm font-semibold text-red-700">
                {errorInfo.title}
              </div>
              <p className="mt-1 text-sm text-red-600">{errorInfo.message}</p>
              <div className="mt-4 flex justify-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleRetry()}
                  className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition-colors"
                >
                  <RotateCcw className="h-4 w-4" />
                  {errorInfo.actionLabel}
                </button>
              </div>
            </div>
          ) : null}

          {/* Indicador discreto: voz do navegador em uso (fallback) */}
          {usingBrowserVoice && status !== "error" ? (
            <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-medium text-amber-700">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              Voz do navegador
            </div>
          ) : null}

          {/* Transcrição e resposta recentes */}
          {transcript || lastAssistant ? (
            <div className="mt-8 w-full max-w-md space-y-2">
              {transcript ? (
                <div className="rounded-2xl rounded-bl-md bg-[#6366F1]/10 px-4 py-3 text-sm text-[#0F172A]">
                  <span className="mr-2 text-[11px] font-bold uppercase text-[#6366F1]">
                    Você
                  </span>
                  {transcript}
                </div>
              ) : null}
              {lastAssistant ? (
                <div className="rounded-2xl rounded-bl-md bg-white px-4 py-3 text-sm text-[#0F172A] ring-1 ring-[#E6E8F0]">
                  <span className="mr-2 text-[11px] font-bold uppercase text-[#10B981]">
                    Agente
                  </span>
                  {lastAssistant}
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}
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
    <div className="max-w-sm rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-sm text-amber-700">
      <div className="text-base font-semibold">
        {info?.title ?? "Acesso ao microfone indisponível"}
      </div>
      <p className="mt-1">
        {info?.message ??
          "O acesso ao microfone exige um navegador atualizado e uma conexão segura (HTTPS)."}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 transition-colors"
      >
        <RotateCcw className="h-4 w-4" /> Verificar novamente
      </button>
    </div>
  );
}
