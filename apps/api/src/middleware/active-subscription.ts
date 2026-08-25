import { Request, Response, NextFunction } from "express";
import { prisma } from "@prospector/database";
import { ApiError } from "../lib/http";

/**
 * BLOQUEIO POR VENCIMENTO DA ASSINATURA.
 *
 * Bloqueia ações de negócio (criar/enviar/prospectar) quando a assinatura está
 * EXPIRADA (current_period_end no passado) — exceto rotas de billing/planos,
 * que permanecem acessíveis para o cliente renovar.
 *
 * PLATFORM_ADMIN / PLATFORM_STAFF ignoram o bloqueio (suporte/impersonação).
 */
export async function requireActiveSubscription(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const user = req.user as
    | { businessId?: string; platform_role?: string | null }
    | undefined;

  if (!user?.businessId) return next();
  if (user.platform_role === "PLATFORM_ADMIN" || user.platform_role === "PLATFORM_STAFF")
    return next();

  const business = await prisma.business.findUnique({
    where: { id: user.businessId },
    select: { status: true },
  });
  if (business?.status !== "ACTIVE") {
    return next(
      ApiError.forbidden(
        "Sua assinatura está pendente ou inativa. Renove para continuar usando o SAVYRON.",
      ),
    );
  }

  const subscription = await prisma.subscription.findUnique({
    where: { business_id: user.businessId },
    select: { current_period_end: true, status: true },
  });
  if (
    subscription?.current_period_end &&
    subscription.current_period_end.getTime() < Date.now()
  ) {
    return next(
      ApiError.forbidden(
        "Seu plano expirou. Para continuar usando o SAVYRON, renove sua assinatura em Planos.",
      ),
    );
  }

  next();
}
