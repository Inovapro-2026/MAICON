'use client';

import { useEffect } from 'react';
import { ChunkErrorBoundary, registerChunkErrorListener } from '@/components/chunk-error-boundary';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isChunkError =
    error.name === 'ChunkLoadError' ||
    /loading chunk \d+ failed|failed to fetch dynamically imported module|loading css chunk/i.test(
      error.message ?? ''
    );

  useEffect(() => {
    registerChunkErrorListener();
  }, []);

  const handleReload = () => {
    try {
      window.sessionStorage.setItem('savyron:chunk-retry', '99');
    } catch {
      /* armazenamento indisponível — ignora */
    }
    window.location.reload();
  };

  return (
    <html lang="pt-BR" className={inter.variable}>
      <body className="min-h-screen bg-zinc-50 font-sans antialiased">
        <ChunkErrorBoundary>
          <div className="flex min-h-screen items-center justify-center p-6">
            <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
              <h1 className="text-lg font-bold text-zinc-900">
                {isChunkError ? 'Atualização do sistema' : 'Algo deu errado'}
              </h1>
              <p className="mt-2 text-sm text-zinc-500">
                {isChunkError
                  ? 'Há uma nova versão do SAVYRON disponível. Recarregue para continuar.'
                  : 'Ocorreu um erro inesperado. Tente novamente.'}
              </p>
              <div className="mt-6 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={handleReload}
                  className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
                >
                  Recarregar
                </button>
                {!isChunkError ? (
                  <button
                    type="button"
                    onClick={reset}
                    className="inline-flex items-center justify-center rounded-xl border border-zinc-300 bg-white px-6 py-3 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400"
                  >
                    Tentar novamente
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </ChunkErrorBoundary>
      </body>
    </html>
  );
}
