/** Políticas de administração (SAVYRON) — funções puras e testáveis. */

export const PLATFORM_ROLES = [
  "NONE",
  "PLATFORM_ADMIN",
  "PLATFORM_STAFF",
] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const BUSINESS_ROLES = [
  "OWNER",
  "BUSINESS_ADMIN",
  "MANAGER",
  "AGENT",
] as const;
export type BusinessRole = (typeof BUSINESS_ROLES)[number];

export const BUSINESS_STATUSES = [
  "TRIAL",
  "ACTIVE",
  "PAST_DUE",
  "SUSPENDED",
  "CANCELLED",
  "PENDING_PAYMENT",
] as const;
export type BusinessStatus = (typeof BUSINESS_STATUSES)[number];

/** Valida se o valor é um platform_role aceito; devolve o normalizado ou null. */
export function normalizePlatformRole(value: unknown): PlatformRole | null {
  if (typeof value !== "string") return null;
  const v = value as PlatformRole;
  return PLATFORM_ROLES.includes(v) ? v : null;
}

/** Valida se o valor é um business_role aceito; devolve o normalizado ou null. */
export function normalizeBusinessRole(value: unknown): BusinessRole | null {
  if (typeof value !== "string") return null;
  const v = value as BusinessRole;
  return BUSINESS_ROLES.includes(v) ? v : null;
}

/** Valida se o valor é um status de empresa aceito. */
export function normalizeBusinessStatus(value: unknown): BusinessStatus | null {
  if (typeof value !== "string") return null;
  const v = value as BusinessStatus;
  return BUSINESS_STATUSES.includes(v) ? v : null;
}

/**
 * Regra anti-lockout: impede que o próprio admin se rebaixe de PLATFORM_ADMIN
 * (ou se desative) quando ele é o último PLATFORM_ADMIN do sistema.
 *
 * @returns mensagem de erro (se a operação deve ser bloqueada) ou null (ok).
 */
export function validateSelfRoleChange(opts: {
  actorId: string;
  targetId: string;
  /** É o último PLATFORM_ADMIN restante (exclui o próprio alvo). */
  isLastPlatformAdmin: boolean;
  /** Se o alvo é o próprio ator. */
  isSelf: boolean;
  /** Novo platform_role do alvo. */
  newRole: unknown;
  /** Se o ator está desativando o alvo. */
  disabling?: boolean;
}): string | null {
  if (!opts.isSelf) return null;
  const newRole = normalizePlatformRole(opts.newRole);
  const degrades = newRole !== null && newRole !== "PLATFORM_ADMIN";
  if ((degrades || opts.disabling) && opts.isLastPlatformAdmin) {
    return "Não é possível: você é o último admin da plataforma.";
  }
  return null;
}

/**
 * Decide se uma alteração de role de plataforma feita por um PLATFORM_ADMIN é
 * permitida. Regras:
 * - apenas PLATFORM_ADMIN pode conceder/revogar PLATFORM_ADMIN;
 * - o rebaixamento do próprio ator respeita o anti-lockout (validateSelfRoleChange).
 */
export function validatePlatformRoleChange(opts: {
  actorRole: string;
  targetId: string;
  actorId: string;
  /** Total de PLATFORM_ADMIN no sistema (incluindo o alvo). */
  platformAdminCount: number;
  targetIsPlatformAdmin: boolean;
  newRole: unknown;
}): string | null {
  if (opts.actorRole !== "PLATFORM_ADMIN")
    return "Apenas PLATFORM_ADMIN pode alterar papéis.";
  const newRole = normalizePlatformRole(opts.newRole);
  if (newRole === null) return "platform_role inválido.";

  const self = opts.actorId === opts.targetId;
  const isLastPlatformAdmin =
    opts.targetIsPlatformAdmin && opts.platformAdminCount <= 1;
  return validateSelfRoleChange({
    actorId: opts.actorId,
    targetId: opts.targetId,
    isLastPlatformAdmin,
    isSelf: self,
    newRole,
  });
}
