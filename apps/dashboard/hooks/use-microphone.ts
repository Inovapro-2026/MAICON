"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type MicPermission =
  | "granted"
  | "denied"
  | "prompt"
  | "unsupported"
  | "insecure"
  | "unknown";

export type MicErrorCode =
  | "NOT_ALLOWED"
  | "NOT_FOUND"
  | "NOT_READABLE"
  | "OVERCONSTRAINED"
  | "SECURITY"
  | "ABORT"
  | "INCOMPATIBLE"
  | "INSECURE_CONTEXT"
  | "UNKNOWN";

export interface MicDiagnostic {
  available: boolean;
  permission: MicPermission;
  reason: string | null;
  errorCode: MicErrorCode | null;
}

/** Verifica o suporte/estado do microfone sem solicitar permissão. */
export async function checkMicrophoneAvailability(): Promise<MicDiagnostic> {
  // Contexto inseguro (http, not localhost): getUserMedia não existe.
  if (typeof window !== "undefined" && window.isSecureContext === false) {
    return {
      available: false,
      permission: "insecure",
      reason:
        "O acesso ao microfone exige uma conexão segura (HTTPS). Estamos trabalhando nisso.",
      errorCode: "INSECURE_CONTEXT",
    };
  }

  if (typeof navigator === "undefined" || !navigator.mediaDevices) {
    return {
      available: false,
      permission: "unsupported",
      reason:
        "Seu navegador não suporta acesso ao microfone. Use Chrome, Edge ou Safari atualizados.",
      errorCode: "INCOMPATIBLE",
    };
  }

  if (typeof navigator.mediaDevices.getUserMedia !== "function") {
    return {
      available: false,
      permission: "unsupported",
      reason: "Este navegador não oferece suporte à captura de áudio.",
      errorCode: "INCOMPATIBLE",
    };
  }

  // Permission API — consulta sem abrir o prompt nativo.
  if (navigator.permissions && typeof navigator.permissions.query === "function") {
    try {
      const result = await navigator.permissions.query({
        name: "microphone" as PermissionName,
      });
      const state = result.state as PermissionState;
      if (state === "granted") {
        return {
          available: true,
          permission: "granted",
          reason: null,
          errorCode: null,
        };
      }
      if (state === "denied") {
        return {
          available: false,
          permission: "denied",
          reason: "O acesso ao microfone foi bloqueado neste navegador.",
          errorCode: "NOT_ALLOWED",
        };
      }
      return {
        available: true,
        permission: "prompt",
        reason: null,
        errorCode: null,
      };
    } catch {
      // Permission API indisponível para 'microphone' em alguns navegadores.
      return {
        available: true,
        permission: "unknown",
        reason: null,
        errorCode: null,
      };
    }
  }

  return {
    available: true,
    permission: "unknown",
    reason: null,
    errorCode: null,
  };
}

/** Mapeia um erro de getUserMedia para diagnóstico estruturado. */
export function diagnoseMicError(error: unknown): MicDiagnostic {
  const name = (error as DOMException)?.name ?? "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return {
        available: false,
        permission: "denied",
        reason:
          "O acesso ao microfone foi bloqueado. No Chrome, toque no ícone de permissões do site na barra de endereço e permita o microfone.",
        errorCode: "NOT_ALLOWED",
      };
    case "NotFoundError":
    case "DevicesNotFoundError":
      return {
        available: false,
        permission: "unknown",
        reason: "Nenhum microfone foi encontrado neste dispositivo.",
        errorCode: "NOT_FOUND",
      };
    case "NotReadableError":
    case "TrackStartError":
      return {
        available: false,
        permission: "unknown",
        reason:
          "Não foi possível acessar o microfone. Ele pode estar sendo usado por outro aplicativo.",
        errorCode: "NOT_READABLE",
      };
    case "OverconstrainedError":
      return {
        available: false,
        permission: "unknown",
        reason:
          "O microfone encontrado não atende aos requisitos de captura de áudio deste dispositivo.",
        errorCode: "OVERCONSTRAINED",
      };
    case "SecurityError":
      return {
        available: false,
        permission: "insecure",
        reason: "O acesso ao microfone foi bloqueado por política de segurança.",
        errorCode: "SECURITY",
      };
    case "AbortError":
      return {
        available: false,
        permission: "unknown",
        reason: "A solicitação de acesso ao microfone foi cancelada.",
        errorCode: "ABORT",
      };
    default:
      return {
        available: false,
        permission: "unknown",
        reason: "Não foi possível acessar o microfone. Tente novamente.",
        errorCode: "UNKNOWN",
      };
  }
}

/** Mensagem de orientação por erro (para exibição em cards). */
export function micErrorAction(diag: MicDiagnostic): {
  title: string;
  message: string;
  actionLabel: string;
  canRetry: boolean;
} {
  switch (diag.errorCode) {
    case "NOT_ALLOWED":
      return {
        title: "Microfone bloqueado",
        message: diag.reason ?? "",
        actionLabel: "Tentar novamente",
        canRetry: true,
      };
    case "NOT_FOUND":
      return {
        title: "Microfone não encontrado",
        message: diag.reason ?? "",
        actionLabel: "Tentar novamente",
        canRetry: true,
      };
    case "NOT_READABLE":
    case "OVERCONSTRAINED":
      return {
        title: "Microfone indisponível",
        message: diag.reason ?? "",
        actionLabel: "Tentar novamente",
        canRetry: true,
      };
    case "INSECURE_CONTEXT":
    case "SECURITY":
      return {
        title: "Conexão segura necessária",
        message: diag.reason ?? "",
        actionLabel: "Recarregar",
        canRetry: true,
      };
    case "ABORT":
      return {
        title: "Solicitação cancelada",
        message: diag.reason ?? "",
        actionLabel: "Tentar novamente",
        canRetry: true,
      };
    default:
      return {
        title: "Não foi possível acessar o microfone",
        message: diag.reason ?? "Ocorreu um erro inesperado.",
        actionLabel: "Tentar novamente",
        canRetry: true,
      };
  }
}

export interface UseMicrophoneResult {
  /** Diagnóstico inicial (sem solicitar permissão). */
  diagnostic: MicDiagnostic | null;
  /** true quando já foi solicitada permissão nesta sessão. */
  requested: boolean;
  /** Solicita permissão (deve ser chamado após interação do usuário). */
  requestPermission: () => Promise<MicDiagnostic>;
  /** Reavalia o estado atual sem solicitar. */
  refresh: () => Promise<void>;
}

/**
 * Hook centralizado de acesso ao microfone.
 * NUNCA solicita permissão automaticamente — apenas após interação explícita.
 */
export function useMicrophone(): UseMicrophoneResult {
  const [diagnostic, setDiagnostic] = useState<MicDiagnostic | null>(null);
  const [requested, setRequested] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    void checkMicrophoneAvailability().then((d) => {
      if (mountedRef.current) setDiagnostic(d);
    });
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const d = await checkMicrophoneAvailability();
    if (mountedRef.current) setDiagnostic(d);
  }, []);

  const requestPermission = useCallback(async (): Promise<MicDiagnostic> => {
    setRequested(true);
    try {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        const d = await checkMicrophoneAvailability();
        if (mountedRef.current) setDiagnostic(d);
        return d;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      // Concedeu: devolve as tracks imediatamente (o agente re-solicita ao gravar).
      stream.getTracks().forEach((t) => t.stop());
      const d: MicDiagnostic = {
        available: true,
        permission: "granted",
        reason: null,
        errorCode: null,
      };
      if (mountedRef.current) setDiagnostic(d);
      return d;
    } catch (error) {
      const d = diagnoseMicError(error);
      if (mountedRef.current) setDiagnostic(d);
      return d;
    }
  }, []);

  return { diagnostic, requested, requestPermission, refresh };
}