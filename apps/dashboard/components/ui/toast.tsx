'use client';

import * as React from 'react';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';

type ToastKind = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  toast: (kind: ToastKind, message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const toast = React.useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);

  const value = React.useMemo<ToastContextValue>(
    () => ({ toast, success: (m) => toast('success', m), error: (m) => toast('error', m) }),
    [toast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed left-1/2 top-4 z-[100] flex w-[92%] max-w-md -translate-x-1/2 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-2 rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur ${
              t.kind === 'success'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600'
                : t.kind === 'error'
                  ? 'border-red-500/30 bg-red-500/10 text-red-600'
                  : 'border-blue-500/30 bg-blue-500/10 text-blue-600'
            }`}
          >
            {t.kind === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : t.kind === 'error' ? <AlertCircle className="h-4 w-4 shrink-0" /> : <Info className="h-4 w-4 shrink-0" />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast deve ser usado dentro de ToastProvider');
  return ctx;
}
