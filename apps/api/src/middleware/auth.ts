import { NextFunction, Request, Response } from "express";
import { prisma } from "@prospector/database";
import { createLogger } from "@prospector/logger";
import { ApiError } from "../lib/http";
import { verifyToken, TokenPayload } from "../services/jwt";

const logger = createLogger("api.auth");

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

/** Exige um token JWT válido no header Authorization. */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return next(ApiError.unauthorized("Token ausente"));
  }
  const token = header.slice(7);
  verifyToken(token)
    .then(async (payload) => {
      if (!payload) {
        logger.warn("Token inválido ou expirado", { ip: req.ip });
        return next(ApiError.unauthorized("Token inválido ou expirado"));
      }
      req.user = payload;

      // Conta desativada bloqueia inclusive sessões ATIVAS (não só o próximo
      // login): cada requisição autenticada revalida o status no banco.
      try {
        const user = await prisma.user.findUnique({
          where: { id: payload.sub },
          select: { active: true },
        });
        if (!user || user.active === false) {
          return next(
            ApiError.forbidden("Conta desativada. Fale com o suporte."),
          );
        }

        // Token sem businessId (ex.: sessão emitida antes de o usuário ter
        // empresa, ou antes de ser vinculado a uma): resolve a empresa padrão
        // do usuário a partir dos vínculos reais — mesma escolha que o login
        // faria (pickDefaultBusiness). Corrige "Nenhuma empresa selecionada"
        // em sessões antigas sem exigir novo login.
        if (!payload.businessId) {
          const membership = await prisma.businessMember.findFirst({
            where: { user_id: payload.sub },
            orderBy: { created_at: "asc" as const },
            select: { business_id: true },
          });
          if (membership) payload.businessId = membership.business_id;
        }
      } catch (error) {
        return next(error);
      }

      return next();
    })
    .catch((error) => next(error));
}

/**
 * Exige que o token carregue um businessId ativo (contexto de empresa).
 * Usado por rotas que operam sobre dados de uma empresa específica.
 * Deve ser usado após requireAuth.
 */
export function requireBusiness(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.user?.businessId) {
    return next(ApiError.forbidden("Nenhuma empresa selecionada"));
  }
  return next();
}

/**
 * Exige que o usuário possua um dos papéis de empresa informados no business ativo.
 * Role hierarchy (OWNER > BUSINESS_ADMIN > MANAGER > AGENT): OWNER e BUSINESS_ADMIN
 * são aceitos sempre que BUSINESS_ADMIN for exigido; etc.
 * Deve ser usado após requireAuth + requireBusiness.
 */
export function requireRole(
  roles: Array<"OWNER" | "BUSINESS_ADMIN" | "MANAGER" | "AGENT">,
) {
  const level: Record<string, number> = {
    AGENT: 0,
    MANAGER: 1,
    BUSINESS_ADMIN: 2,
    OWNER: 3,
  };
  const min = Math.min(...roles.map((r) => level[r]));
  return (req: Request, _res: Response, next: NextFunction): void => {
    const role = req.user?.businessRole;
    if (!role || level[role] < min) {
      return next(ApiError.forbidden("Permissão insuficiente"));
    }
    return next();
  };
}

/** Exige papel de plataforma (PLATFORM_ADMIN ou PLATFORM_STAFF). */
export function requirePlatformRole(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const role = req.user?.platform_role;
  if (role !== "PLATFORM_ADMIN" && role !== "PLATFORM_STAFF") {
    logDeniedAdminAccess(req, "requirePlatformRole");
    return next(ApiError.forbidden("Acesso restrito à plataforma"));
  }
  return next();
}

/**
 * Exige PLATFORM_ADMIN (mutações do painel: usuários, planos, assinaturas,
 * pagamentos, settings, impersonação, reset). PLATFORM_STAFF tem acesso
 * somente leitura.
 */
export function requirePlatformAdmin(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (req.user?.platform_role !== "PLATFORM_ADMIN") {
    logDeniedAdminAccess(req, "requirePlatformAdmin");
    return next(ApiError.forbidden("Esta ação requer PLATFORM_ADMIN"));
  }
  return next();
}

/**
 * Registra tentativa NEGADA de acesso a /admin (403). Usa log estruturado
 * para detectar tentativas de escalonamento de privilégio, sem poluir a
 * auditoria de negócio.
 */
function logDeniedAdminAccess(
  req: Request,
  middleware: "requirePlatformRole" | "requirePlatformAdmin",
): void {
  logger.warn("Acesso negado a rota /admin", {
    middleware,
    // originalUrl inclui o prefixo /admin (req.path é relativo ao router).
    url: req.originalUrl,
    method: req.method,
    actor: req.user?.sub,
    platform_role: req.user?.platform_role ?? "none",
    ip: req.ip,
  });
}
