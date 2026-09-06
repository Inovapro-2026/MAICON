import { useState } from "react";
import type { CSSProperties } from "react";
import type { SavyronModuleId, SavyronState } from "./types";

interface SavyronModuleProps {
  id: SavyronModuleId;
  label: string;
  floatDuration: number;
  isActive?: boolean;
  isHovered?: boolean;
  systemState?: SavyronState;
  compact?: boolean;
  onHover?: (hovered: boolean) => void;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
}

function renderIcon(id: SavyronModuleId, active: boolean) {
  switch (id) {
    case "pesquisa":
      return (
        <div className="relative w-12 h-12 flex items-center justify-center">
          <svg viewBox="0 0 48 48" className="w-full h-full overflow-visible">
            <defs>
              <linearGradient
                id="searchGrad"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
              >
                <stop offset="0%" stopColor="#00f5ff" />
                <stop offset="100%" stopColor="#6366f1" />
              </linearGradient>
              <filter
                id="searchGlowHigh"
                x="-50%"
                y="-50%"
                width="200%"
                height="200%"
              >
                <feGaussianBlur stdDeviation="3.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <circle
              cx="20"
              cy="20"
              r="13"
              fill="none"
              stroke={active ? "#00f5ff" : "url(#searchGrad)"}
              strokeWidth={active ? "3.8" : "3.2"}
              filter={active ? "url(#searchGlowHigh)" : undefined}
              className="transition-all duration-300"
            />
            {active && (
              <circle
                cx="20"
                cy="20"
                r="13"
                fill="none"
                stroke="#38bdf8"
                strokeWidth="6"
                opacity="0.25"
                className="animate-pulse"
              />
            )}
            <circle
              cx="20"
              cy="20"
              r="10"
              fill={
                active ? "rgba(0, 245, 255, 0.18)" : "rgba(56, 189, 248, 0.12)"
              }
              className="transition-all duration-300"
            />
            <path
              d="M 14 13 A 8 8 0 0 1 24 13"
              fill="none"
              stroke="#ffffff"
              strokeWidth="1.6"
              strokeLinecap="round"
              opacity={active ? "0.95" : "0.8"}
            />
            <line
              x1="29.5"
              y1="29.5"
              x2="41"
              y2="41"
              stroke={active ? "#00f5ff" : "url(#searchGrad)"}
              strokeWidth={active ? "4.5" : "4"}
              strokeLinecap="round"
              filter={active ? "url(#searchGlowHigh)" : undefined}
              className="transition-all duration-300"
            />
            {active && (
              <g
                className="animate-spin-slow"
                style={{
                  transformOrigin: "20px 20px",
                  animationDuration: "4s",
                }}
              >
                <line
                  x1="13"
                  y1="20"
                  x2="27"
                  y2="20"
                  stroke="#00f5ff"
                  strokeWidth="1"
                  opacity="0.9"
                />
                <line
                  x1="20"
                  y1="13"
                  x2="20"
                  y2="27"
                  stroke="#00f5ff"
                  strokeWidth="1"
                  opacity="0.9"
                />
                <circle
                  cx="20"
                  cy="20"
                  r="5"
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="0.8"
                  strokeDasharray="2 2"
                />
              </g>
            )}
          </svg>
        </div>
      );

    case "objetivo":
      return (
        <div className="relative w-12 h-12 flex items-center justify-center">
          <svg viewBox="0 0 48 48" className="w-full h-full overflow-visible">
            <defs>
              <linearGradient
                id="targetGrad"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
              >
                <stop offset="0%" stopColor="#00f5ff" />
                <stop offset="50%" stopColor="#818cf8" />
                <stop offset="100%" stopColor="#c084fc" />
              </linearGradient>
              <filter
                id="targetGlowEnhanced"
                x="-50%"
                y="-50%"
                width="200%"
                height="200%"
              >
                <feGaussianBlur stdDeviation="3.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <circle
              cx="24"
              cy="24"
              r="18"
              fill="none"
              stroke="url(#targetGrad)"
              strokeWidth={active ? "3.2" : "2.8"}
              filter={active ? "url(#targetGlowEnhanced)" : undefined}
              className={active ? "animate-pulse" : ""}
            />
            {active && (
              <g opacity="0.85">
                <line
                  x1="24"
                  y1="3"
                  x2="24"
                  y2="9"
                  stroke="#00f5ff"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <line
                  x1="24"
                  y1="39"
                  x2="24"
                  y2="45"
                  stroke="#00f5ff"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <line
                  x1="3"
                  y1="24"
                  x2="9"
                  y2="24"
                  stroke="#00f5ff"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <line
                  x1="39"
                  y1="24"
                  x2="45"
                  y2="24"
                  stroke="#00f5ff"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </g>
            )}
            <circle
              cx="24"
              cy="24"
              r="12"
              fill="none"
              stroke="#00e5ff"
              strokeWidth="2"
              opacity={active ? "1" : "0.85"}
              filter={active ? "drop-shadow(0 0 6px #00f0ff)" : undefined}
            />
            <circle
              cx="24"
              cy="24"
              r={active ? "6.5" : "5.5"}
              fill="url(#targetGrad)"
              filter={
                active
                  ? "drop-shadow(0 0 12px #00f0ff) drop-shadow(0 0 18px #8b5cf6)"
                  : undefined
              }
              className="transition-all duration-300"
            />
            <circle cx="24" cy="24" r="2.2" fill="#ffffff" />
            <path
              d="M 39 9 L 28 20 M 39 9 L 33 8 M 39 9 L 40 15"
              fill="none"
              stroke="#ffffff"
              strokeWidth={active ? "2.8" : "2.4"}
              strokeLinecap="round"
              strokeLinejoin="round"
              filter={
                active
                  ? "drop-shadow(0 0 8px #00f0ff)"
                  : "drop-shadow(0 0 4px #00f0ff)"
              }
              className={active ? "animate-pulse" : ""}
            />
          </svg>
        </div>
      );

    case "planeja":
      return (
        <div className="relative w-12 h-12 flex items-center justify-center">
          <svg viewBox="0 0 48 48" className="w-full h-full overflow-visible">
            <defs>
              <linearGradient id="planGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#00f5ff" />
                <stop offset="100%" stopColor="#9333ea" />
              </linearGradient>
            </defs>
            <rect
              x="10"
              y="9"
              width="28"
              height="34"
              rx="5"
              fill="rgba(15, 23, 42, 0.6)"
              stroke="url(#planGrad)"
              strokeWidth={active ? "2.6" : "2.2"}
              filter={
                active
                  ? "drop-shadow(0 0 8px rgba(0, 245, 255, 0.4))"
                  : undefined
              }
            />
            <rect
              x="18"
              y="6"
              width="12"
              height="6"
              rx="2"
              fill="#38bdf8"
              stroke="#9333ea"
              strokeWidth="1"
            />
            <path
              d="M 15 19 L 18 22 L 23 16"
              fill="none"
              stroke="#00f5ff"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter={active ? "drop-shadow(0 0 5px #00f5ff)" : undefined}
              className={active ? "animate-pulse" : ""}
            />
            <line
              x1="26"
              y1="19"
              x2={active ? 34 : 33}
              y2="19"
              stroke={active ? "#38bdf8" : "#94a3b8"}
              strokeWidth="2"
              strokeLinecap="round"
              className="transition-all duration-300"
            />
            <path
              d="M 15 27 L 18 30 L 23 24"
              fill="none"
              stroke="#38bdf8"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter={active ? "drop-shadow(0 0 5px #38bdf8)" : undefined}
              className={active ? "animate-pulse" : ""}
              style={{ animationDelay: "0.2s" }}
            />
            <line
              x1="26"
              y1="27"
              x2={active ? 34 : 33}
              y2="27"
              stroke={active ? "#818cf8" : "#94a3b8"}
              strokeWidth="2"
              strokeLinecap="round"
              className="transition-all duration-300"
            />
            <path
              d="M 15 35 L 18 38 L 23 32"
              fill="none"
              stroke="#a855f7"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter={active ? "drop-shadow(0 0 5px #a855f7)" : undefined}
              className={active ? "animate-pulse" : ""}
              style={{ animationDelay: "0.4s" }}
            />
            <line
              x1="26"
              y1="35"
              x2={active ? 34 : 33}
              y2="35"
              stroke={active ? "#c084fc" : "#94a3b8"}
              strokeWidth="2"
              strokeLinecap="round"
              className="transition-all duration-300"
            />
            {active && (
              <line
                x1="12"
                y1="14"
                x2="36"
                y2="14"
                stroke="#00f5ff"
                strokeWidth="1.2"
                strokeDasharray="4 2"
                opacity="0.8"
                className="animate-scan-sweep"
              />
            )}
          </svg>
        </div>
      );

    case "comunica":
      return (
        <div className="relative w-12 h-12 flex items-center justify-center">
          <svg viewBox="0 0 48 48" className="w-full h-full overflow-visible">
            <defs>
              <linearGradient id="mailGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#00f5ff" />
                <stop offset="50%" stopColor="#818cf8" />
                <stop offset="100%" stopColor="#c084fc" />
              </linearGradient>
            </defs>
            <rect
              x="8"
              y="13"
              width="32"
              height="24"
              rx="4"
              fill="rgba(15, 23, 42, 0.6)"
              stroke="url(#mailGrad)"
              strokeWidth="2.2"
              filter={
                active
                  ? "drop-shadow(0 0 6px rgba(0, 245, 255, 0.35))"
                  : undefined
              }
            />
            <path
              d="M 8 15 L 24 27 L 40 15"
              fill="none"
              stroke="url(#mailGrad)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M 9 36 L 19 25 M 39 36 L 29 25"
              fill="none"
              stroke="rgba(56, 189, 248, 0.4)"
              strokeWidth="1.6"
            />
            <circle
              cx="24"
              cy="27"
              r={active ? "2.5" : "1.5"}
              fill="#00f5ff"
              filter={active ? "drop-shadow(0 0 6px #00f0ff)" : undefined}
            />
            {active && (
              <g>
                <path
                  d="M 28 9 A 6 6 0 0 1 34 15"
                  fill="none"
                  stroke="#00f5ff"
                  strokeWidth="2"
                  strokeLinecap="round"
                  className="animate-pulse"
                />
                <path
                  d="M 31 6 A 10 10 0 0 1 39 14"
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  className="animate-pulse"
                  style={{ animationDelay: "0.2s" }}
                />
                <path
                  d="M 34 3 A 14 14 0 0 1 44 13"
                  fill="none"
                  stroke="#a855f7"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  className="animate-pulse"
                  style={{ animationDelay: "0.4s" }}
                />
                <circle
                  cx="44"
                  cy="13"
                  r="1.5"
                  fill="#ffffff"
                  filter="drop-shadow(0 0 4px #00f5ff)"
                />
              </g>
            )}
          </svg>
        </div>
      );

    case "executa":
      return (
        <div className="relative w-12 h-12 flex items-center justify-center">
          <svg viewBox="0 0 48 48" className="w-full h-full overflow-visible">
            <defs>
              <linearGradient id="gearGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#00f5ff" />
                <stop offset="100%" stopColor="#3b82f6" />
              </linearGradient>
            </defs>
            <g
              className={active ? "animate-spin" : ""}
              style={{
                transformOrigin: "24px 24px",
                animationDuration: active ? "2.8s" : "0s",
              }}
            >
              <path
                d="M 22 7 L 26 7 L 27 11 L 31 12.5 L 34 9.5 L 37.5 13 L 34.5 16 L 36 20 L 40 21 L 40 25 L 36 26 L 34.5 30 L 37.5 33 L 34 36.5 L 31 33.5 L 27 35 L 26 39 L 22 39 L 21 35 L 17 33.5 L 14 36.5 L 10.5 33 L 13.5 30 L 12 26 L 8 25 L 8 21 L 12 20 L 13.5 16 L 10.5 13 L 14 9.5 L 17 12.5 L 21 11 Z"
                fill="none"
                stroke="url(#gearGrad)"
                strokeWidth="2.5"
                strokeLinejoin="round"
                filter={active ? "drop-shadow(0 0 10px #00f0ff)" : undefined}
              />
              <circle
                cx="24"
                cy="24"
                r="6"
                fill="#0b1120"
                stroke="#00f5ff"
                strokeWidth="2.2"
              />
              <circle
                cx="24"
                cy="24"
                r="2.5"
                fill="#38bdf8"
                filter={active ? "drop-shadow(0 0 6px #00f0ff)" : undefined}
              />
            </g>
            {active && (
              <g
                className="animate-spin-reverse-slow"
                style={{
                  transformOrigin: "24px 24px",
                  animationDuration: "8s",
                }}
              >
                <circle
                  cx="24"
                  cy="24"
                  r="19"
                  fill="none"
                  stroke="rgba(0, 245, 255, 0.4)"
                  strokeWidth="1"
                  strokeDasharray="3 7"
                />
              </g>
            )}
          </svg>
        </div>
      );

    case "analisa":
      return (
        <div className="relative w-12 h-12 flex items-center justify-center">
          <svg viewBox="0 0 48 48" className="w-full h-full overflow-visible">
            <defs>
              <linearGradient id="barGrad1" x1="0%" y1="100%" x2="0%" y2="0%">
                <stop offset="0%" stopColor="#1e3a8a" />
                <stop offset="100%" stopColor="#00f5ff" />
              </linearGradient>
              <linearGradient id="barGrad2" x1="0%" y1="100%" x2="0%" y2="0%">
                <stop offset="0%" stopColor="#4338ca" />
                <stop offset="100%" stopColor="#38bdf8" />
              </linearGradient>
              <linearGradient id="barGrad3" x1="0%" y1="100%" x2="0%" y2="0%">
                <stop offset="0%" stopColor="#6b21a8" />
                <stop offset="100%" stopColor="#a855f7" />
              </linearGradient>
            </defs>
            <line
              x1="8"
              y1="39"
              x2="40"
              y2="39"
              stroke="#334155"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <rect
              x="11"
              y={active ? undefined : 26}
              width="6.5"
              height={active ? undefined : 13}
              rx="2"
              fill="url(#barGrad1)"
              className={
                active ? "animate-bar-1" : "transition-all duration-300"
              }
              filter={active ? "drop-shadow(0 0 6px #00f5ff)" : undefined}
            />
            <rect
              x="21"
              y={active ? undefined : 18}
              width="6.5"
              height={active ? undefined : 21}
              rx="2"
              fill="url(#barGrad2)"
              className={
                active ? "animate-bar-2" : "transition-all duration-300"
              }
              filter={active ? "drop-shadow(0 0 6px #38bdf8)" : undefined}
            />
            <rect
              x="31"
              y={active ? undefined : 10}
              width="6.5"
              height={active ? undefined : 29}
              rx="2"
              fill="url(#barGrad3)"
              className={
                active ? "animate-bar-3" : "transition-all duration-300"
              }
              filter={active ? "drop-shadow(0 0 10px #a855f7)" : undefined}
            />
          </svg>
        </div>
      );

    case "aprende":
      return (
        <div className="relative w-12 h-12 flex items-center justify-center">
          <svg viewBox="0 0 48 48" className="w-full h-full overflow-visible">
            <defs>
              <linearGradient
                id="learnGrad"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
              >
                <stop offset="0%" stopColor="#00f5ff" />
                <stop offset="60%" stopColor="#818cf8" />
                <stop offset="100%" stopColor="#a855f7" />
              </linearGradient>
            </defs>
            <circle
              cx="24"
              cy="24"
              r="17"
              fill="none"
              stroke="url(#learnGrad)"
              strokeWidth="2.8"
              filter={active ? "drop-shadow(0 0 10px #00f0ff)" : undefined}
            />
            {active && (
              <g>
                <circle
                  cx="24"
                  cy="24"
                  r="21"
                  fill="none"
                  stroke="#00f5ff"
                  strokeWidth="1.8"
                  opacity="0.6"
                  className="animate-ping"
                />
                <circle
                  cx="24"
                  cy="24"
                  r="25"
                  fill="none"
                  stroke="#a855f7"
                  strokeWidth="1.2"
                  opacity="0.4"
                  className="animate-ping"
                  style={{ animationDuration: "2.4s" }}
                />
              </g>
            )}
            <path
              d="M 16 24 L 22 30 L 32 18"
              fill="none"
              stroke="#ffffff"
              strokeWidth={active ? "3.6" : "3.2"}
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="drop-shadow(0 0 6px #00f5ff)"
              className="transition-all duration-200"
            />
          </svg>
        </div>
      );

    default:
      return null;
  }
}

export function SavyronModule({
  id,
  label,
  floatDuration,
  isActive = false,
  isHovered = false,
  compact = false,
  onHover,
  onClick,
  className = "",
  style = {},
}: SavyronModuleProps) {
  const [internalHover, setInternalHover] = useState(false);
  const active = isActive || isHovered || internalHover;

  const handleMouseEnter = () => {
    setInternalHover(true);
    onHover?.(true);
  };

  const handleMouseLeave = () => {
    setInternalHover(false);
    onHover?.(false);
  };

  return (
    <div
      id={`module-${id}`}
      style={{ ...style, animationDuration: `${floatDuration}s` }}
      className={`animate-float-soft cursor-pointer ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
    >
      <div
        className={`relative flex flex-col items-center justify-center rounded-xl transition-all duration-300 transform group ${
          compact
            ? "w-[76px] sm:w-[84px] h-[64px] sm:h-[70px] px-1"
            : "w-[96px] sm:w-[108px] md:w-[114px] h-[78px] sm:h-[84px] md:h-[88px]"
        } ${
          id === "pesquisa" && active
            ? "-translate-y-1.5 scale-[1.05] border-cyan-300 shadow-[0_0_24px_rgba(0,245,255,0.5),inset_0_0_12px_rgba(0,245,255,0.2)] ring-1 ring-cyan-400/50"
            : active
              ? "-translate-y-1 scale-[1.03] border-blue-400/60 shadow-[0_0_18px_rgba(59,130,246,0.3)]"
              : "border-white/10 shadow-[0_4px_16px_rgba(0,0,0,0.5)] hover:border-blue-500/40 hover:shadow-[0_0_16px_rgba(59,130,246,0.2)]"
        }`}
        style={{
          background:
            id === "pesquisa" && active
              ? "rgba(0, 245, 255, 0.10)"
              : active
                ? "rgba(59, 130, 246, 0.07)"
                : "rgba(255, 255, 255, 0.025)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          borderWidth: "1px",
        }}
      >
        <div
          className={`absolute top-0 left-0 right-0 h-[1px] rounded-t-xl transition-opacity duration-300 ${
            active ? "opacity-100" : "opacity-30"
          }`}
          style={{
            background:
              id === "pesquisa" && active
                ? "linear-gradient(90deg, transparent 0%, rgba(0, 245, 255, 1) 50%, transparent 100%)"
                : "linear-gradient(90deg, transparent 0%, rgba(59, 130, 246, 0.8) 50%, transparent 100%)",
          }}
        />

        <div
          className={`transition-transform duration-300 origin-center ${
            compact ? "scale-[0.70]" : "scale-[0.82] sm:scale-[0.88]"
          } ${
            active
              ? "scale-95 sm:scale-100 drop-shadow-[0_0_10px_rgba(59,130,246,0.6)]"
              : "opacity-85 group-hover:opacity-100"
          }`}
        >
          {renderIcon(id, active)}
        </div>

        <span
          className={`uppercase transition-all duration-200 truncate max-w-[92%] text-center select-none ${
            compact
              ? "mt-0.5 text-[7px] sm:text-[7.5px] tracking-[0.14em]"
              : "mt-1 text-[8px] sm:text-[9px] tracking-[0.18em]"
          } ${
            active
              ? "text-cyan-300 font-bold drop-shadow-[0_0_6px_rgba(0,245,255,0.7)]"
              : "text-slate-400 font-medium opacity-75 group-hover:opacity-100 group-hover:text-slate-200"
          }`}
        >
          {label}
        </span>

        <div
          className={`absolute flex items-center justify-center ${compact ? "top-1 right-1" : "top-2 right-2"}`}
        >
          <div
            className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
              active
                ? "bg-cyan-400 shadow-[0_0_8px_#00f0ff] animate-pulse"
                : "bg-slate-600"
            }`}
          />
        </div>
      </div>
    </div>
  );
}
