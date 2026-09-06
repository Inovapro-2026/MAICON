import type { SavyronModuleId, SavyronState } from "./types";

interface SavyronConnectionProps {
  activeModule?: SavyronModuleId | null;
  hoveredModule?: SavyronModuleId | null;
  state?: SavyronState;
}

interface PathDefinition {
  id: SavyronModuleId;
  d: string;
  startNode: [number, number];
  endNode: [number, number];
  baseDuration: number;
}

/** Rede neural SVG interligando o núcleo aos 7 módulos (fótons animados). */
export function SavyronConnection({
  activeModule,
  hoveredModule,
  state = "idle",
}: SavyronConnectionProps) {
  const paths: PathDefinition[] = [
    { id: "objetivo", d: "M 500 215 L 500 160", startNode: [500, 215], endNode: [500, 160], baseDuration: 2.5 },
    { id: "pesquisa", d: "M 412 252 C 345 225, 290 185, 241 175", startNode: [412, 252], endNode: [241, 175], baseDuration: 2.8 },
    { id: "planeja", d: "M 375 340 L 232 340", startNode: [375, 340], endNode: [232, 340], baseDuration: 2.2 },
    { id: "executa", d: "M 415 428 C 345 455, 290 495, 246 505", startNode: [415, 428], endNode: [246, 505], baseDuration: 3.1 },
    { id: "comunica", d: "M 588 252 C 655 225, 710 185, 760 175", startNode: [588, 252], endNode: [760, 175], baseDuration: 2.9 },
    { id: "analisa", d: "M 625 340 L 770 340", startNode: [625, 340], endNode: [770, 340], baseDuration: 2.4 },
    { id: "aprende", d: "M 585 428 C 655 455, 710 495, 755 505", startNode: [585, 428], endNode: [755, 505], baseDuration: 3.2 },
  ];

  const isThinking = state === "thinking";
  let speedMultiplier = 1;
  if (isThinking) speedMultiplier = 0.45;
  else if (state === "processing") speedMultiplier = 0.4;
  else if (state === "speaking") speedMultiplier = 0.7;
  else if (state === "listening") speedMultiplier = 1.2;

  return (
    <svg
      viewBox="0 0 1000 700"
      preserveAspectRatio="xMidYMid meet"
      className="absolute inset-0 w-full h-full pointer-events-none z-0 overflow-visible"
    >
      <defs>
        <filter id="connGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="packetGlow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id="connGradDefault" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#818cf8" stopOpacity="0.4" />
        </linearGradient>
        <linearGradient id="connGradActive" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00f5ff" stopOpacity="1" />
          <stop offset="50%" stopColor="#38bdf8" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#c084fc" stopOpacity="1" />
        </linearGradient>
        <linearGradient id="connGradThinking" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00f5ff" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#818cf8" stopOpacity="0.8" />
        </linearGradient>
      </defs>

      {paths.map((p) => {
        const isCurrentActive = activeModule === p.id || hoveredModule === p.id;
        const isPesquisaSupercharged = p.id === "pesquisa" && isCurrentActive;

        const dur = isPesquisaSupercharged
          ? "0.75"
          : (p.baseDuration * speedMultiplier * (isCurrentActive ? 0.55 : 1)).toFixed(2);

        return (
          <g key={p.id} id={`connection-${p.id}`} className="transition-opacity duration-300">
            <path
              d={p.d}
              fill="none"
              stroke={
                isPesquisaSupercharged
                  ? "rgba(0, 245, 255, 0.8)"
                  : isCurrentActive
                    ? "rgba(59, 130, 246, 0.7)"
                    : isThinking
                      ? "rgba(0, 229, 255, 0.45)"
                      : "rgba(59, 130, 246, 0.2)"
              }
              strokeWidth={isPesquisaSupercharged ? "3.5" : isCurrentActive ? "2.8" : isThinking ? "2.2" : "1.5"}
              strokeDasharray={isPesquisaSupercharged ? "6 3" : "4 4"}
              strokeLinecap="round"
              filter={isPesquisaSupercharged || isCurrentActive || isThinking ? "url(#connGlow)" : undefined}
              className="transition-all duration-300"
            />

            <path
              d={p.d}
              fill="none"
              stroke={
                isPesquisaSupercharged
                  ? "#00f5ff"
                  : isCurrentActive
                    ? "url(#connGradActive)"
                    : isThinking
                      ? "url(#connGradThinking)"
                      : "rgba(59, 130, 246, 0.35)"
              }
              strokeWidth={isPesquisaSupercharged ? "2.6" : isCurrentActive ? "2.2" : isThinking ? "1.8" : "1"}
              strokeLinecap="round"
              className="transition-all duration-300"
            />

            <circle
              cx={p.startNode[0]}
              cy={p.startNode[1]}
              r={isPesquisaSupercharged ? 6 : isCurrentActive ? 5 : isThinking ? 4.5 : 3.5}
              fill={isPesquisaSupercharged ? "#ffffff" : "#00f5ff"}
              filter="url(#connGlow)"
              className="transition-all duration-300"
            />

            <circle
              cx={p.endNode[0]}
              cy={p.endNode[1]}
              r={isPesquisaSupercharged ? 6.5 : isCurrentActive ? 5.5 : isThinking ? 5 : 4}
              fill={isPesquisaSupercharged ? "#00f5ff" : isCurrentActive ? "#ffffff" : isThinking ? "#38bdf8" : "#38bdf8"}
              filter="url(#connGlow)"
              className="transition-all duration-300"
            />

            <circle
              r={isPesquisaSupercharged ? 5.5 : isCurrentActive ? 4.5 : isThinking ? 4 : 3.2}
              fill="#ffffff"
              filter="url(#packetGlow)"
            >
              <animateMotion
                path={p.d}
                dur={`${dur}s`}
                repeatCount="indefinite"
                keyPoints="0;1"
                keyTimes="0;1"
                calcMode="linear"
              />
            </circle>

            <circle
              r={isPesquisaSupercharged ? 3.5 : isThinking ? 2.5 : 2}
              fill={isPesquisaSupercharged ? "#00f5ff" : "#38bdf8"}
              opacity={isPesquisaSupercharged ? 1 : isCurrentActive ? 0.9 : isThinking ? 0.8 : 0.6}
            >
              <animateMotion
                path={p.d}
                dur={`${dur}s`}
                repeatCount="indefinite"
                keyPoints="0;1"
                keyTimes="0;1"
                calcMode="linear"
                begin={`${parseFloat(dur) * 0.45}s`}
              />
            </circle>

            {(isPesquisaSupercharged || isThinking) && (
              <circle
                r={isPesquisaSupercharged ? 3 : 2}
                fill="#ffffff"
                filter="url(#packetGlow)"
                opacity={0.9}
              >
                <animateMotion
                  path={p.d}
                  dur={`${dur}s`}
                  repeatCount="indefinite"
                  keyPoints="0;1"
                  keyTimes="0;1"
                  calcMode="linear"
                  begin={`${parseFloat(dur) * 0.75}s`}
                />
              </circle>
            )}
          </g>
        );
      })}
    </svg>
  );
}