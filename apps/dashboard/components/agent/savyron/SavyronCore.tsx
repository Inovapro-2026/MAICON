import { useMemo } from "react";
import type { SavyronState } from "./types";

interface SavyronCoreProps {
  state?: SavyronState;
  audioAmplitude?: number;
  activeModuleName?: string | null;
  className?: string;
}

/** Núcleo holográfico 3D do SAVYRON (robô + anéis neon + pedestal). */
export function SavyronCore({
  state = "idle",
  audioAmplitude = 0.5,
  activeModuleName,
  className = "",
}: SavyronCoreProps) {
  const isThinking = state === "thinking";
  const isListening = state === "listening";
  const isSpeaking = state === "speaking";
  const isProcessing = state === "processing";
  const isError = state === "error";

  const eyeGlow = useMemo(() => {
    if (isError)
      return "drop-shadow(0 0 16px #ef4444) drop-shadow(0 0 24px rgba(239, 68, 68, 0.9))";
    if (isThinking)
      return "drop-shadow(0 0 16px #ffffff) drop-shadow(0 0 24px #00f0ff) drop-shadow(0 0 36px rgba(0, 245, 255, 0.9))";
    if (isProcessing) return "drop-shadow(0 0 16px #38bdf8)";
    if (isSpeaking) return `drop-shadow(0 0 ${10 + audioAmplitude * 12}px #00f0ff)`;
    return "drop-shadow(0 0 8px #00e5ff)";
  }, [isError, isThinking, isProcessing, isSpeaking, audioAmplitude]);

  const coreGlowIntensity = isThinking
    ? "opacity-100 scale-110 drop-shadow-[0_0_40px_rgba(0,245,255,0.8)]"
    : isSpeaking
      ? "opacity-95"
      : isProcessing
        ? "opacity-95"
        : "opacity-80";

  return (
    <div
      id="savyron-ai-core"
      className={`relative flex flex-col items-center justify-center select-none ${className}`}
      style={{ width: 440, height: 480 }}
    >
      <div
        className={`absolute w-[420px] h-[420px] rounded-full pointer-events-none transition-all duration-700 ${
          isError
            ? "bg-gradient-to-tr from-red-500/40 via-orange-500/25 to-red-600/30 blur-[70px] scale-110 opacity-95"
            : isThinking
              ? "bg-gradient-to-tr from-cyan-400/50 via-blue-500/45 to-violet-500/50 blur-[75px] scale-125 opacity-100 animate-pulse"
              : isListening
                ? "bg-gradient-to-r from-blue-500/35 via-cyan-400/30 to-emerald-500/25 blur-[60px] scale-105 opacity-90"
                : isSpeaking
                  ? "bg-gradient-to-tr from-cyan-400/40 via-purple-600/35 to-blue-500/40 blur-[65px] scale-110 opacity-95"
                  : isProcessing
                    ? "bg-gradient-to-br from-violet-600/35 via-cyan-500/35 to-indigo-500/30 blur-[65px] scale-110 opacity-95"
                    : "bg-gradient-to-tr from-cyan-500/20 via-blue-600/25 to-violet-600/20 blur-[60px] scale-100 opacity-80"
        }`}
        style={{ top: 30 }}
      />

      {(isListening || isSpeaking) && (
        <div className="absolute top-[80px] flex items-center justify-center pointer-events-none">
          <div
            className="absolute w-[240px] h-[240px] rounded-full border border-cyan-400/40 animate-ping opacity-60"
            style={{ animationDuration: isSpeaking ? "1.4s" : "2.4s" }}
          />
          <div
            className="absolute w-[320px] h-[320px] rounded-full border border-violet-400/30 animate-ping opacity-40"
            style={{ animationDuration: isSpeaking ? "2.1s" : "3.2s", animationDelay: "0.6s" }}
          />
          <div
            className="absolute w-[390px] h-[390px] rounded-full border border-blue-400/20 animate-ping opacity-25"
            style={{ animationDuration: isSpeaking ? "2.8s" : "4s", animationDelay: "1.2s" }}
          />
        </div>
      )}

      <div className="absolute top-[20px] w-[380px] h-[380px] flex items-center justify-center pointer-events-none">
        <svg
          viewBox="0 0 400 400"
          className="w-full h-full overflow-visible"
          style={{ filter: "drop-shadow(0 0 18px rgba(0, 210, 255, 0.4))" }}
        >
          <defs>
            <linearGradient id="ringGlowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.9" />
              <stop offset="50%" stopColor="#3b82f6" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#a855f7" stopOpacity="0.95" />
            </linearGradient>
            <linearGradient id="beaconGrad" x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor="#00e5ff" stopOpacity="0.9" />
              <stop offset="70%" stopColor="#3b82f6" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#00e5ff" stopOpacity="0.1" />
            </linearGradient>
            <radialGradient id="projectorBeamGrad" cx="50%" cy="100%" r="90%">
              <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.45" />
              <stop offset="40%" stopColor="#3b82f6" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
            </radialGradient>
            <filter id="coreNeonGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="4" result="blur1" />
              <feGaussianBlur stdDeviation="12" result="blur2" />
              <feMerge>
                <feMergeNode in="blur2" />
                <feMergeNode in="blur1" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <polygon
            points="140,360 260,360 290,160 110,160"
            fill="url(#projectorBeamGrad)"
            className="transition-opacity duration-500"
            style={{ opacity: isThinking || isProcessing ? 0.85 : 0.55 }}
          />

          <path
            d="M 200 65
               C 275 65, 335 125, 335 200
               C 335 260, 270 320, 200 365
               C 130 320, 65 260, 65 200
               C 65 125, 125 65, 200 65 Z"
            fill="none"
            stroke={isError ? "rgba(239, 68, 68, 0.9)" : "url(#ringGlowGrad)"}
            strokeWidth="2.5"
            filter="url(#coreNeonGlow)"
            className={`transition-all duration-700 ${coreGlowIntensity}`}
          />

          <circle
            cx="200"
            cy="195"
            r="120"
            fill="none"
            stroke={isError ? "rgba(239, 68, 68, 0.7)" : "#00e5ff"}
            strokeWidth="3"
            filter="url(#coreNeonGlow)"
            className="animate-pulse-rings"
          />

          <circle
            cx="200"
            cy="195"
            r="134"
            fill="none"
            stroke="rgba(168, 85, 247, 0.6)"
            strokeWidth="1.8"
            strokeDasharray="8 12 4 16"
            className={isProcessing ? "animate-spin-slow" : "animate-spin-reverse-slow"}
            style={{ transformOrigin: "200px 195px", animationDuration: isProcessing ? "12s" : "36s" }}
          />

          <circle
            cx="200"
            cy="195"
            r="105"
            fill="none"
            stroke="rgba(56, 189, 248, 0.45)"
            strokeWidth="1.2"
            strokeDasharray="4 8"
            className="animate-spin-slow"
            style={{ transformOrigin: "200px 195px", animationDuration: isThinking ? "14s" : "45s" }}
          />

          <circle cx="200" cy="75" r="4.5" fill="#00f5ff" filter="url(#coreNeonGlow)" />
          <circle cx="110" cy="115" r="4" fill="#00f5ff" filter="url(#coreNeonGlow)" />
          <circle cx="80" cy="195" r="4.5" fill="#a855f7" filter="url(#coreNeonGlow)" />
          <circle cx="115" cy="275" r="4" fill="#00f5ff" filter="url(#coreNeonGlow)" />
          <circle cx="290" cy="115" r="4" fill="#00f5ff" filter="url(#coreNeonGlow)" />
          <circle cx="320" cy="195" r="4.5" fill="#a855f7" filter="url(#coreNeonGlow)" />
          <circle cx="285" cy="275" r="4" fill="#00f5ff" filter="url(#coreNeonGlow)" />

          <circle cx="200" cy="75" r="3.5" fill="#ffffff">
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 200 195"
              to="360 200 195"
              dur={isProcessing ? "3s" : isThinking ? "5s" : "9s"}
              repeatCount="indefinite"
            />
          </circle>
          <circle cx="200" cy="75" r="2.5" fill="#00f5ff">
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="180 200 195"
              to="540 200 195"
              dur={isProcessing ? "4s" : isThinking ? "6s" : "11s"}
              repeatCount="indefinite"
            />
          </circle>
        </svg>
      </div>

      <div
        className="relative z-10 flex flex-col items-center animate-float-soft transition-transform duration-500"
        style={{ marginTop: -25, animationDuration: isThinking ? "3.8s" : "5.2s" }}
      >
        <svg
          width="168"
          height="180"
          viewBox="0 0 168 180"
          className="overflow-visible filter drop-shadow-[0_12px_28px_rgba(0,180,255,0.45)]"
        >
          <defs>
            <linearGradient id="chassisGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="45%" stopColor="#e2e8f0" />
              <stop offset="85%" stopColor="#cbd5e1" />
              <stop offset="100%" stopColor="#94a3b8" />
            </linearGradient>
            <linearGradient id="chassisRim" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
              <stop offset="60%" stopColor="#38bdf8" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#1e293b" stopOpacity="0.9" />
            </linearGradient>
            <radialGradient id="visorGlassGrad" cx="50%" cy="40%" r="70%">
              <stop offset="0%" stopColor="#0f172a" />
              <stop offset="70%" stopColor="#050814" />
              <stop offset="100%" stopColor="#02040a" />
            </radialGradient>
            <linearGradient id="visorGloss" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.28" />
              <stop offset="40%" stopColor="#38bdf8" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="earGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f8fafc" />
              <stop offset="100%" stopColor="#64748b" />
            </linearGradient>
            <radialGradient id="antennaOrbGrad" cx="40%" cy="35%" r="65%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="40%" stopColor="#00f5ff" />
              <stop offset="100%" stopColor="#0284c7" />
            </radialGradient>
            <filter id="eyeCyanGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="eyeCyanGlowHyper" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="3" result="blur1" />
              <feGaussianBlur stdDeviation="8" result="blur2" />
              <feMerge>
                <feMergeNode in="blur2" />
                <feMergeNode in="blur1" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <rect x="82" y="16" width="4" height="22" rx="2" fill="#cbd5e1" stroke="#64748b" strokeWidth="0.8" />
          <circle
            cx="84"
            cy="14"
            r={isThinking ? 8 : 7}
            fill="url(#antennaOrbGrad)"
            filter={isThinking ? "url(#eyeCyanGlowHyper)" : "url(#eyeCyanGlow)"}
            className={isListening ? "animate-ping" : isThinking ? "animate-pulse" : ""}
          />
          <circle cx="82.5" cy="12" r="2.2" fill="#ffffff" opacity={isThinking ? 1 : 0.85} />

          <ellipse
            cx="84"
            cy="98"
            rx={isThinking ? 66 : 60}
            ry={isThinking ? 56 : 52}
            fill="none"
            stroke={isError ? "rgba(239, 68, 68, 0.5)" : isThinking ? "rgba(0, 245, 255, 0.65)" : "rgba(0, 229, 255, 0.4)"}
            strokeWidth={isThinking ? "5" : "4"}
            filter="blur(8px)"
            className="transition-all duration-500"
          />

          <g transform="translate(14, 80)">
            <rect x="0" y="0" width="16" height="34" rx="8" fill="url(#earGrad)" stroke="#475569" strokeWidth="1" />
            <rect x="3" y="5" width="10" height="24" rx="5" fill="#0b1120" />
            <ellipse
              cx="8"
              cy="17"
              rx="3"
              ry="8"
              fill="none"
              stroke="#00f5ff"
              strokeWidth={isThinking ? "2" : "1.5"}
              opacity={isThinking ? "1" : "0.85"}
              filter={isThinking ? "drop-shadow(0 0 6px #00f0ff)" : undefined}
            />
          </g>

          <g transform="translate(138, 80)">
            <rect x="0" y="0" width="16" height="34" rx="8" fill="url(#earGrad)" stroke="#475569" strokeWidth="1" />
            <rect x="3" y="5" width="10" height="24" rx="5" fill="#0b1120" />
            <ellipse
              cx="8"
              cy="17"
              rx="3"
              ry="8"
              fill="none"
              stroke="#00f5ff"
              strokeWidth={isThinking ? "2" : "1.5"}
              opacity={isThinking ? "1" : "0.85"}
              filter={isThinking ? "drop-shadow(0 0 6px #00f0ff)" : undefined}
            />
          </g>

          <rect
            x="24"
            y="36"
            width="120"
            height="112"
            rx="56"
            fill="url(#chassisGrad)"
            stroke="url(#chassisRim)"
            strokeWidth="2.5"
          />

          <ellipse cx="84" cy="50" rx="38" ry="12" fill="#ffffff" opacity={isThinking ? "0.75" : "0.55"} />

          <rect
            x="36"
            y="54"
            width="96"
            height="74"
            rx="37"
            fill="url(#visorGlassGrad)"
            stroke="#1e293b"
            strokeWidth="1.5"
          />

          <path
            d="M 44 64
               C 65 56, 103 56, 124 64
               C 114 82, 80 84, 44 64 Z"
            fill="url(#visorGloss)"
          />

          {(isThinking || isProcessing) && (
            <g>
              <line
                x1="45"
                y1="82"
                x2="123"
                y2="82"
                stroke="#00f5ff"
                strokeWidth={isThinking ? "2" : "1.2"}
                strokeDasharray="8 4"
                opacity={isThinking ? "0.95" : "0.75"}
                className="animate-scan-sweep"
                filter={isThinking ? "drop-shadow(0 0 8px #00f5ff)" : undefined}
              />
              <line
                x1="48"
                y1="94"
                x2="120"
                y2="94"
                stroke="#38bdf8"
                strokeWidth="1"
                strokeDasharray="4 4"
                opacity={isThinking ? "0.75" : "0.5"}
                className="animate-pulse"
              />
            </g>
          )}

          <g className="transition-all duration-300" style={{ filter: eyeGlow, transformOrigin: "84px 88px" }}>
            {isThinking && (
              <g opacity="0.85">
                <rect
                  x="54"
                  y="81"
                  width="24"
                  height="20"
                  rx="8"
                  fill="none"
                  stroke="#00f5ff"
                  strokeWidth="1.4"
                  className="animate-pulse"
                  filter="drop-shadow(0 0 6px #00f0ff)"
                />
                <rect
                  x="90"
                  y="81"
                  width="24"
                  height="20"
                  rx="8"
                  fill="none"
                  stroke="#00f5ff"
                  strokeWidth="1.4"
                  className="animate-pulse"
                  filter="drop-shadow(0 0 6px #00f0ff)"
                />
              </g>
            )}

            <rect
              x="57"
              y={isSpeaking ? 86 - audioAmplitude * 3 : 84}
              width="18"
              height={isSpeaking ? 12 + audioAmplitude * 6 : 14}
              rx="6"
              fill={isError ? "#ef4444" : isThinking ? "#ffffff" : "#00f5ff"}
              stroke={isThinking ? "#00f5ff" : undefined}
              strokeWidth={isThinking ? "1.5" : undefined}
              filter={isThinking ? "url(#eyeCyanGlowHyper)" : "url(#eyeCyanGlow)"}
              className="transition-all duration-300"
            />
            <rect x="61" y={86} width={isThinking ? 7 : 6} height={isThinking ? 6 : 5} rx="2.5" fill="#ffffff" opacity="1" filter={isThinking ? "drop-shadow(0 0 4px #00f5ff)" : undefined} />

            <rect
              x="93"
              y={isSpeaking ? 86 - audioAmplitude * 3 : 84}
              width="18"
              height={isSpeaking ? 12 + audioAmplitude * 6 : 14}
              rx="6"
              fill={isError ? "#ef4444" : isThinking ? "#ffffff" : "#00f5ff"}
              stroke={isThinking ? "#00f5ff" : undefined}
              strokeWidth={isThinking ? "1.5" : undefined}
              filter={isThinking ? "url(#eyeCyanGlowHyper)" : "url(#eyeCyanGlow)"}
              className="transition-all duration-300"
            />
            <rect x="97" y={86} width={isThinking ? 7 : 6} height={isThinking ? 6 : 5} rx="2.5" fill="#ffffff" opacity="1" filter={isThinking ? "drop-shadow(0 0 4px #00f5ff)" : undefined} />
          </g>

          {isSpeaking ? (
            <g transform="translate(66, 110)">
              <rect x="0" y={5 - audioAmplitude * 5} width="3" height={6 + audioAmplitude * 10} rx="1.5" fill="#00f5ff" />
              <rect x="6" y={3 - audioAmplitude * 8} width="3" height={8 + audioAmplitude * 14} rx="1.5" fill="#38bdf8" />
              <rect x="12" y={1 - audioAmplitude * 10} width="3" height={10 + audioAmplitude * 18} rx="1.5" fill="#ffffff" />
              <rect x="18" y={2 - audioAmplitude * 9} width="3" height={9 + audioAmplitude * 16} rx="1.5" fill="#38bdf8" />
              <rect x="24" y={4 - audioAmplitude * 6} width="3" height={7 + audioAmplitude * 11} rx="1.5" fill="#00f5ff" />
              <rect x="30" y={6 - audioAmplitude * 4} width="3" height={5 + audioAmplitude * 7} rx="1.5" fill="#0284c7" />
            </g>
          ) : (
            <circle cx="84" cy="114" r="2" fill={isError ? "#ef4444" : "#00e5ff"} opacity="0.4" />
          )}

          <path
            d="M 52 144 C 64 154, 104 154, 116 144 C 110 152, 58 152, 52 144 Z"
            fill="#475569"
            stroke="#94a3b8"
            strokeWidth="0.8"
          />
        </svg>

        <div
          className="w-28 h-3 rounded-full blur-sm mt-1 transition-all duration-500"
          style={{
            background: isError ? "rgba(239, 68, 68, 0.25)" : "rgba(34, 211, 238, 0.2)",
            transform: isThinking ? "scale(1.15)" : "scale(1)",
          }}
        />
      </div>

      <div className="relative mt-2 flex flex-col items-center">
        <svg
          width="240"
          height="68"
          viewBox="0 0 240 68"
          className="overflow-visible filter drop-shadow-[0_10px_25px_rgba(0,140,255,0.4)]"
        >
          <defs>
            <linearGradient id="pedestalBaseGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#0b1329" />
              <stop offset="30%" stopColor="#1e293b" />
              <stop offset="50%" stopColor="#334155" />
              <stop offset="70%" stopColor="#1e293b" />
              <stop offset="100%" stopColor="#0b1329" />
            </linearGradient>
            <linearGradient id="pedestalRimGlow" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#00d2ff" stopOpacity="0.3" />
              <stop offset="50%" stopColor="#00f5ff" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#00d2ff" stopOpacity="0.3" />
            </linearGradient>
            <linearGradient id="pedestalNeonRing" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#00f0ff" />
              <stop offset="50%" stopColor="#818cf8" />
              <stop offset="100%" stopColor="#a855f7" />
            </linearGradient>
          </defs>

          <path
            d="M 20 30
               C 20 44, 220 44, 220 30
               L 220 46
               C 220 60, 20 60, 20 46 Z"
            fill="url(#pedestalBaseGrad)"
            stroke="#1e293b"
            strokeWidth="1.2"
          />
          <path
            d="M 20 46 C 20 60, 220 60, 220 46"
            fill="none"
            stroke="url(#pedestalRimGlow)"
            strokeWidth="1.5"
          />
          <ellipse
            cx="120"
            cy="28"
            rx="100"
            ry="20"
            fill="#091124"
            stroke="#38bdf8"
            strokeWidth="1.4"
          />
          <ellipse
            cx="120"
            cy="28"
            rx="86"
            ry="16"
            fill="none"
            stroke="url(#pedestalNeonRing)"
            strokeWidth="2.2"
            filter="drop-shadow(0 0 6px #00f0ff)"
            className="transition-all duration-500"
            style={{ opacity: isThinking || isSpeaking ? 1 : 0.75 }}
          />
          <ellipse
            cx="120"
            cy="28"
            rx="60"
            ry="11"
            fill="none"
            stroke="#00f5ff"
            strokeWidth="1.8"
            strokeDasharray="12 6"
            className="animate-spin-slow"
            style={{ transformOrigin: "120px 28px", animationDuration: "18s" }}
          />
          <ellipse
            cx="120"
            cy="28"
            rx="32"
            ry="6"
            fill={isError ? "rgba(239, 68, 68, 0.9)" : "#00e5ff"}
            opacity="0.9"
            filter={`drop-shadow(0 0 10px ${isError ? "#ef4444" : "#00f0ff"})`}
          />
          <ellipse
            cx="120"
            cy="28"
            rx="14"
            ry="3"
            fill="#ffffff"
            filter="drop-shadow(0 0 8px #ffffff)"
          />
        </svg>

        <div
          className="w-56 h-10 mt-[-10px] rounded-full pointer-events-none"
          style={{
            background: isError
              ? "radial-gradient(ellipse at center, rgba(239, 68, 68, 0.25) 0%, rgba(99, 102, 241, 0.1) 45%, transparent 75%)"
              : "radial-gradient(ellipse at center, rgba(0, 210, 255, 0.25) 0%, rgba(139, 92, 246, 0.12) 45%, transparent 75%)",
            filter: "blur(8px)",
          }}
        />
      </div>

      {activeModuleName && (
        <div className="absolute top-2 px-3 py-1 rounded-full bg-slate-900/80 border border-cyan-400/40 text-[11px] font-mono tracking-wider text-cyan-300 uppercase shadow-[0_0_15px_rgba(0,210,255,0.3)] backdrop-blur-md animate-fade-in pointer-events-none">
          CANAL ATIVO: {activeModuleName}
        </div>
      )}
    </div>
  );
}