import { useMemo } from "react";
import type { SavyronState } from "./types";

interface SavyronMouthProps {
  state: SavyronState;
  /**
   * Amplitude de áudio normalizada e suavizada [0..1].
   * Durante speaking, representa o áudio REAL do TTS (ElevenLabs/WebSpeech).
   * Durante listening, representa a escuta do microfone do usuário (sem abrir a boca).
   */
  audioAmplitude?: number;
  className?: string;
}

/**
 * Componente Facial de Boca Orgânica do Robô SAVYRON (<SavyronMouth />).
 *
 * Renderiza em coordenadas SVG no visor do robô (centro em cx=84, cy=114).
 * Reage estritamente à amplitude real do áudio (Web Audio AnalyserNode),
 * sem Math.random() e sem animações repetitivas artificiais.
 *
 * Estados suportados:
 * - idle: boca fechada neutra com respiração sutil;
 * - listening: boca fechada, pulso de iluminação responsivo à escuta (sem abrir);
 * - thinking: boca fechada, indicador sutil de processamento neural;
 * - processing: linha concentrada e estável;
 * - error: linha fechada com leve tensão avermelhada;
 * - speaking: lábios superior e inferior abrem e fecham organicamente conforme a
 *   amplitude real do TTS, com cavidade vocal holográfica neon.
 */
export function SavyronMouth({
  state = "idle",
  audioAmplitude = 0,
  className = "",
}: SavyronMouthProps) {
  const isSpeaking = state === "speaking";
  const isListening = state === "listening";
  const isThinking = state === "thinking";
  const isProcessing = state === "processing";
  const isError = state === "error";

  // Clamp e normalização defensiva da amplitude
  const normalizedAmp = Math.max(
    0,
    Math.min(1, Number.isFinite(audioAmplitude) ? audioAmplitude : 0),
  );

  // Geometria da boca quando falando: abertura proporcional à amplitude real do TTS
  const mouthGeometry = useMemo(() => {
    const cx = 84;
    const cy = 114;

    if (!isSpeaking) {
      return { cx, cy, width: 22, height: 0, openH: 0 };
    }

    // Abertura vertical máxima de 12px, mínima de 1.8px durante fala ativa
    const openH = Math.max(1.8, Math.min(12.5, normalizedAmp * 16));
    const width = 20 + openH * 0.35; // Leve expansão horizontal ao abrir

    const leftX = cx - width / 2;
    const rightX = cx + width / 2;

    const topY = cy - openH * 0.45;
    const bottomY = cy + openH * 0.55;

    // Caminho da cavidade interna (lábio superior curvo + lábio inferior curvo)
    const cavityPath = `M ${leftX} ${cy} Q ${cx} ${topY} ${rightX} ${cy} Q ${cx} ${bottomY} ${leftX} ${cy} Z`;

    // Linha do lábio superior
    const upperLipPath = `M ${leftX} ${cy} Q ${cx} ${topY} ${rightX} ${cy}`;

    // Linha do lábio inferior
    const lowerLipPath = `M ${leftX} ${cy} Q ${cx} ${bottomY} ${rightX} ${cy}`;

    return {
      cx,
      cy,
      width,
      height: openH,
      openH,
      cavityPath,
      upperLipPath,
      lowerLipPath,
    };
  }, [isSpeaking, normalizedAmp]);

  // Centro da boca
  const cx = 84;
  const cy = 114;

  return (
    <g
      id="savyron-robot-mouth"
      className={`transition-all duration-150 ${className}`}
    >
      <defs>
        {/* Gradiente da cavidade interna da boca durante a fala */}
        <radialGradient id="mouthCavityGrad" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={0.9} />
          <stop offset="35%" stopColor="#00f5ff" stopOpacity={0.7} />
          <stop offset="70%" stopColor="#0284c7" stopOpacity={0.4} />
          <stop offset="100%" stopColor="#030712" stopOpacity={0.95} />
        </radialGradient>

        {/* Glow neon da cavidade vocal */}
        <filter id="mouthNeonGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* ESTADO 1: SPEAKING — Abertura e fechamento orgânicos sincronizados ao TTS real */}
      {isSpeaking && mouthGeometry.cavityPath ? (
        <g>
          {/* Cavidade vocal interna com gradiente e brilho neon */}
          <path
            d={mouthGeometry.cavityPath}
            fill="url(#mouthCavityGrad)"
            filter="url(#mouthNeonGlow)"
            className="transition-all duration-75 ease-out"
          />

          {/* Feixe central de ressonância acústica */}
          {mouthGeometry.openH > 3 && (
            <ellipse
              cx={cx}
              cy={cy}
              rx={Math.max(2, mouthGeometry.openH * 0.9)}
              ry={Math.max(1, mouthGeometry.openH * 0.35)}
              fill="#ffffff"
              opacity={0.85}
              filter="drop-shadow(0 0 4px #00f5ff)"
            />
          )}

          {/* Lábio superior neon */}
          <path
            d={mouthGeometry.upperLipPath}
            fill="none"
            stroke="#00f5ff"
            strokeWidth="1.6"
            strokeLinecap="round"
            filter="drop-shadow(0 0 4px #00f5ff)"
            className="transition-all duration-75 ease-out"
          />

          {/* Lábio inferior neon */}
          <path
            d={mouthGeometry.lowerLipPath}
            fill="none"
            stroke="#38bdf8"
            strokeWidth="1.6"
            strokeLinecap="round"
            filter="drop-shadow(0 0 3px #38bdf8)"
            className="transition-all duration-75 ease-out"
          />

          {/* Comissuras labiais discretas (cantos) */}
          <circle
            cx={cx - mouthGeometry.width / 2}
            cy={cy}
            r="1"
            fill="#00f5ff"
          />
          <circle
            cx={cx + mouthGeometry.width / 2}
            cy={cy}
            r="1"
            fill="#00f5ff"
          />
        </g>
      ) : isListening ? (
        /* ESTADO 2: LISTENING — Boca fechada, micro-resposta luminosa ao som do usuário (SEM falar) */
        <g>
          {/* Linha labial fechada e calma */}
          <path
            d="M 73 114 Q 84 114.6 95 114"
            fill="none"
            stroke="#00e5ff"
            strokeWidth="1.4"
            strokeLinecap="round"
            opacity={0.6 + Math.min(0.4, normalizedAmp * 0.6)}
            filter="drop-shadow(0 0 4px #00e5ff)"
            className="transition-opacity duration-150"
          />
          {/* Indicador de escuta atenta no centro (sem abertura) */}
          <circle
            cx={cx}
            cy={cy + 0.3}
            r={1.2 + Math.min(1.2, normalizedAmp * 1.5)}
            fill="#00f5ff"
            opacity={0.8}
            filter="drop-shadow(0 0 3px #00f5ff)"
          />
        </g>
      ) : isThinking ? (
        /* ESTADO 3: THINKING — Linha concentrada com pulso de raciocínio neural */
        <g>
          <path
            d="M 74 114 Q 84 114.2 94 114"
            fill="none"
            stroke="#38bdf8"
            strokeWidth="1.3"
            strokeLinecap="round"
            opacity={0.75}
            strokeDasharray="4 2"
            className="animate-pulse"
            filter="drop-shadow(0 0 4px #00f5ff)"
          />
          <circle
            cx={cx}
            cy={cy}
            r="1.4"
            fill="#ffffff"
            opacity={0.9}
            filter="drop-shadow(0 0 3px #00f5ff)"
          />
        </g>
      ) : isProcessing ? (
        /* ESTADO 4: PROCESSING — Linha focada */
        <g>
          <path
            d="M 74 114 L 94 114"
            fill="none"
            stroke="#818cf8"
            strokeWidth="1.3"
            strokeLinecap="round"
            opacity={0.7}
            strokeDasharray="3 3"
          />
          <circle cx={cx} cy={cy} r="1.2" fill="#818cf8" />
        </g>
      ) : isError ? (
        /* ESTADO 5: ERROR — Linha tensa avermelhada */
        <g>
          <path
            d="M 73 114.5 Q 84 113.8 95 114.5"
            fill="none"
            stroke="#ef4444"
            strokeWidth="1.4"
            strokeLinecap="round"
            opacity={0.85}
            filter="drop-shadow(0 0 5px rgba(239, 68, 68, 0.7))"
          />
        </g>
      ) : (
        /* ESTADO 6: IDLE — Boca praticamente parada com respiração sutil */
        <g>
          <path
            d="M 73 114 Q 84 114.8 95 114"
            fill="none"
            stroke="#00e5ff"
            strokeWidth="1.2"
            strokeLinecap="round"
            opacity={0.5}
            filter="drop-shadow(0 0 3px rgba(0, 229, 255, 0.4))"
          />
          <circle cx={cx} cy={cy + 0.4} r="1" fill="#00e5ff" opacity={0.4} />
        </g>
      )}
    </g>
  );
}
