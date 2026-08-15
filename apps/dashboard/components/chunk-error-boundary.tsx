'use client';

import { Component, ReactNode } from 'react';

const RETRY_KEY = 'savyron:chunk-retry';
const MAX_AUTO_RELOADS = 2;

function isChunkLoadError(error: unknown): boolean {
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error);
  return (
    name === 'ChunkLoadError' ||
    /loading chunk \d+ failed|failed to fetch dynamically imported module|loading css chunk/i.test(
      message
    )
  );
}

function getRetryCount(): number {
  try {
    return Number(window.sessionStorage.getItem(RETRY_KEY) ?? '0');
  } catch {
    return 0;
  }
}

function setRetryCount(n: number): void {
  try {
    window.sessionStorage.setItem(RETRY_KEY, String(n));
  } catch {
    /* armazenamento indisponível — ignora */
  }
}

function clearRetryCount(): void {
  try {
    window.sessionStorage.removeItem(RETRY_KEY);
  } catch {
    /* armazenamento indisponível — ignora */
  }
}

/**
 * Contorna o `ChunkLoadError` típico de deploys: o navegador com um build
 * antigo tenta carregar um chunk cujo hash não existe mais no servidor.
 * Em vez de mostrar uma tela quebrada, recarrega a página uma vez para
 * baixar o build novo; se continuar falhando, exibe fallback com "Recarregar".
 */
export class ChunkErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  componentDidMount(): void {
    registerChunkErrorListener();
  }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    if (isChunkLoadError(error)) {
      const attempts = getRetryCount();
      if (attempts < MAX_AUTO_RELOADS) {
        setRetryCount(attempts + 1);
        window.location.reload();
        return;
      }
      clearRetryCount();
    }
    // Exibe o fallback (limpa o estado apenas se ainda não estiver em failed).
    if (!this.state.failed) this.setState({ failed: true });
  }

  private handleReload = (): void => {
    clearRetryCount();
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.failed) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-6">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
            <h1 className="text-lg font-bold text-zinc-900">Algo deu errado</h1>
            <p className="mt-2 text-sm text-zinc-500">
              Não foi possível carregar a versão mais recente do sistema. Tente recarregar a página.
            </p>
            <button
              type="button"
              onClick={this.handleReload}
              className="mt-6 inline-flex items-center justify-center rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
            >
              Recarregar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Fallback global: detecta `ChunkLoadError` fora do ciclo de render do React
 * (ex.: lazy-loading de módulos) e força um reload para pegar o build novo.
 */
export function registerChunkErrorListener(): void {
  if (typeof window === 'undefined') return;

  const maybeReload = (error: unknown): void => {
    if (error && isChunkLoadError(error)) {
      const attempts = getRetryCount();
      if (attempts < MAX_AUTO_RELOADS) {
        setRetryCount(attempts + 1);
        window.location.reload();
      } else {
        clearRetryCount();
      }
    }
  };

  window.addEventListener('error', (event) => maybeReload(event?.error));
  window.addEventListener('unhandledrejection', (event) => maybeReload(event?.reason));
}
