import type { SavyronState } from "./types";

interface SavyronStatusProps {
  state?: SavyronState;
  className?: string;
}

export function SavyronStatus({ state = "idle", className = "" }: SavyronStatusProps) {
  const isThinking = state === "thinking";
  const isProcessing = state === "processing";
  const isError = state === "error";

  return (
    <div
      id="savyron-status-capsule"
      className={`relative inline-flex items-center gap-2.5 sm:gap-4 px-3.5 sm:px-6 py-1.5 sm:py-2 rounded-full border transition-all duration-500 select-none ${className}`}
      style={{
        borderColor: isError ? "rgba(239, 68, 68, 0.5)" : "rgba(59, 130, 246, 0.3)",
        background: "rgba(255, 255, 255, 0.03)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        boxShadow: isError
          ? "0 0 25px rgba(239, 68, 68, 0.4), inset 0 0 12px rgba(239, 68, 68, 0.15)"
          : isThinking || isProcessing
            ? "0 0 25px rgba(59, 130, 246, 0.35), inset 0 0 12px rgba(59, 130, 246, 0.15)"
            : "0 0 15px rgba(59, 130, 246, 0.2)",
      }}
    >
      <div
        className="w-1.5 sm:w-2 h-1.5 sm:h-2 rounded-full"
        style={{
          background: isError ? "rgba(239, 68, 68, 1)" : "rgba(96, 165, 250, 1)",
          boxShadow: isError ? "0 0 8px #ef4444" : "0 0 8px #60a5fa",
        }}
      />

      <div className="flex items-center gap-1.5 sm:gap-2 text-[9px] sm:text-[11px] tracking-[0.2em] sm:tracking-[0.3em] font-black uppercase text-blue-100/80">
        <span>Autônomo</span>
        <span className="text-blue-500">•</span>
        <span>Confiável</span>
        <span className="text-blue-500">•</span>
        <span>Seguro</span>
      </div>

      <div className="relative flex items-center justify-center w-3.5 sm:w-4 h-3.5 sm:h-4 text-blue-400">
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-full h-full">
          <path
            fillRule="evenodd"
            d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 4.946-2.597 9.181-6.5 11.5a11.554 11.554 0 01-3 1.498 11.557 11.557 0 01-3-1.498C2.597 16.181 0 11.946 0 7c0-.68.056-1.35.166-2.001a1 1 0 01.99-.834l.01.001zM10 14.243l3.182-3.182a1 1 0 10-1.415-1.414L10 11.414l-1.768-1.767a1 1 0 00-1.414 1.414L10 14.243z"
            clipRule="evenodd"
          />
        </svg>
      </div>
    </div>
  );
}