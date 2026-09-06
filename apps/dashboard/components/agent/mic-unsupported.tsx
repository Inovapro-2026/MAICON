"use client";

import { RotateCcw } from "lucide-react";
import { micErrorAction } from "@/hooks/use-microphone";
import type { MicDiagnostic } from "@/hooks/use-microphone";

/** Bloco exibido quando o navegador/contexto não suporta captura de áudio. */
export function MicUnsupported({
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