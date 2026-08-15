import { Router, Request, Response } from "express";
import { prisma } from "@prospector/database";
import { createLogger } from "@prospector/logger";
import { asyncHandler, ok, ApiError } from "../lib/http";
import { requireAuth } from "../middleware/auth";
import { signToken } from "../services/jwt";
import {
  hashPassword,
  validatePasswordStrength,
  verifyPassword,
} from "../services/password";
import {
  listUserBusinesses,
  resolveBusinessContext,
  BusinessSummary,
} from "../services/business-context";
import {
  sendVerificationCode,
  verifyEmailCode,
  createBusinessFromSignup,
} from "../services/onboarding";
import { listActivePlans } from "../services/billing";
import { writeAudit } from "../services/audit";

const logger = createLogger("api.auth");

export const authRouter = Router();

/** Serializa o usuário para resposta pública (sem hash). */
function toPublicUser(user: {
  id: string;
  email: string;
  name: string;
  role: string;
  platform_role: string;
  must_change_password: boolean;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    platform_role: user.platform_role,
    must_change_password: user.must_change_password,
  };
}

async function loadBusinessList(userId: string): Promise<BusinessSummary[]> {
  return listUserBusinesses(userId);
}

/**
 * Se o usuário não tiver businessId no token (ou ele não for válido),
 * escolhe a primeira empresa da lista de forma não-autoritária.
 * A validação real acontece em requireBusiness/resolveBusinessContext.
 */
function pickDefaultBusiness(
  businesses: BusinessSummary[],
): BusinessSummary | null {
  return businesses.length > 0 ? businesses[0] : null;
}

authRouter.post(
  "/login",
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body ?? {};

    if (!email || !password) {
      return res
        .status(400)
        .json({
          success: false,
          error: { code: "BAD_REQUEST", message: "Informe e-mail e senha" },
        });
    }

    const user = await prisma.user.findUnique({
      where: { email: String(email).toLowerCase().trim() },
    });
    if (!user) {
      logger.warn("Login falhou: usuário não encontrado", {
        email: String(email).toLowerCase(),
      });
      return res
        .status(401)
        .json({
          success: false,
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Credenciais inválidas",
          },
        });
    }

    if (user.active === false) {
      logger.warn("Login bloqueado: conta desativada", {
        email: user.email,
        userId: user.id,
      });
      return res
        .status(403)
        .json({
          success: false,
          error: {
            code: "ACCOUNT_DISABLED",
            message: "Conta desativada. Fale com o suporte.",
          },
        });
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      logger.warn("Login falhou: senha incorreta", { email: user.email });
      return res
        .status(401)
        .json({
          success: false,
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Credenciais inválidas",
          },
        });
    }

    const businesses = await loadBusinessList(user.id);
    const active = pickDefaultBusiness(businesses);

    const token = await signToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      must_change_password: user.must_change_password,
      platform_role: user.platform_role,
      businessId: active?.id,
      businessRole: active?.role,
    });

    logger.info("Login realizado", {
      email: user.email,
      userId: user.id,
      businessId: active?.id,
    });
    return ok(res, {
      token,
      user: toPublicUser(user),
      businesses,
      active_business: active
        ? {
            id: active.id,
            name: active.name,
            slug: active.slug,
            role: active.role,
            status: active.status,
          }
        : null,
      must_change_password: user.must_change_password,
    });
  }),
);

authRouter.post(
  "/change-password",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { current_password, new_password } = req.body ?? {};
    const userId = req.user!.sub;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user)
      return res
        .status(404)
        .json({
          success: false,
          error: { code: "NOT_FOUND", message: "Usuário não encontrado" },
        });

    const valid = await verifyPassword(
      String(current_password ?? ""),
      user.password_hash,
    );
    if (!valid) {
      return res
        .status(400)
        .json({
          success: false,
          error: { code: "BAD_REQUEST", message: "Senha atual incorreta" },
        });
    }

    const strengthError = validatePasswordStrength(String(new_password ?? ""));
    if (strengthError) {
      return res
        .status(400)
        .json({
          success: false,
          error: { code: "BAD_REQUEST", message: strengthError },
        });
    }

    const newHash = await hashPassword(new_password);
    await prisma.user.update({
      where: { id: userId },
      data: { password_hash: newHash, must_change_password: false },
    });

    const businesses = await loadBusinessList(userId);
    const token = await signToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      must_change_password: false,
      platform_role: user.platform_role,
      businessId: businesses[0]?.id,
      businessRole: businesses[0]?.role,
    });

    logger.info("Senha alterada", { email: user.email });
    return ok(res, { token, message: "Senha alterada com sucesso" });
  }),
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
    if (!user)
      return res
        .status(404)
        .json({
          success: false,
          error: { code: "NOT_FOUND", message: "Usuário não encontrado" },
        });

    const businesses = await loadBusinessList(user.id);

    // Se o token trazia businessId, verifica se pertence à empresa.
    let active = null;
    if (req.user?.businessId) {
      const ctx = await resolveBusinessContext(user.id, req.user.businessId);
      if (ctx) active = ctx;
    }
    if (!active) active = pickDefaultBusiness(businesses);

    return ok(res, {
      user: toPublicUser(user),
      businesses,
      active_business: active
        ? {
            id: "businessId" in active ? active.businessId : active.id,
            role: "businessRole" in active ? active.businessRole : active.role,
            status: "status" in active ? active.status : undefined,
          }
        : null,
      must_change_password: user.must_change_password,
    });
  }),
);

authRouter.get(
  "/businesses",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const businesses = await loadBusinessList(req.user!.sub);
    return ok(res, { businesses });
  }),
);

/**
 * Permite trocar a empresa ativa no token (sem reautenticar com senha).
 * Recebe { business_id } e devolve um novo token com businessId/businessRole.
 */
authRouter.post(
  "/select-business",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = String(req.body?.business_id ?? "");
    if (!businessId) {
      return res
        .status(400)
        .json({
          success: false,
          error: { code: "BAD_REQUEST", message: "Informe business_id" },
        });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
    if (!user)
      return res
        .status(404)
        .json({
          success: false,
          error: { code: "NOT_FOUND", message: "Usuário não encontrado" },
        });

    const ctx = await resolveBusinessContext(user.id, businessId);
    if (!ctx) {
      logger.warn("Troca de empresa negada: usuário não pertence à empresa", {
        userId: user.id,
        businessId,
      });
      return res
        .status(403)
        .json({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Você não pertence a esta empresa",
          },
        });
    }

    const token = await signToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      must_change_password: user.must_change_password,
      platform_role: user.platform_role,
      businessId: ctx.businessId,
      businessRole: ctx.businessRole,
    });

    logger.info("Empresa ativa alterada", {
      userId: user.id,
      businessId: ctx.businessId,
    });
    return ok(res, {
      token,
      active_business: { id: ctx.businessId, role: ctx.businessRole },
    });
  }),
);

authRouter.post("/logout", requireAuth, (_req, res) => {
  ok(res, { message: "Sessão encerrada" });
});

// ===========================================================================
// ONBOARDING (SAVYRON) — cadastro com verificação de e-mail
// ===========================================================================

/** GET /auth/plans — planos ativos (sem auth; consumido na tela de signup). */
authRouter.get(
  "/plans",
  asyncHandler(async (_req: Request, res: Response) => {
    const plans = await listActivePlans();
    return ok(res, { plans });
  }),
);

/** POST /auth/send-code — envia código de verificação para o e-mail. */
authRouter.post(
  "/send-code",
  asyncHandler(async (req: Request, res: Response) => {
    const email = String(req.body?.email ?? "");
    if (!email) throw ApiError.badRequest("Informe o e-mail");
    await sendVerificationCode(email);
    return ok(res, { sent: true });
  }),
);

/** POST /auth/verify-code — valida o código (uso único). */
authRouter.post(
  "/verify-code",
  asyncHandler(async (req: Request, res: Response) => {
    const email = String(req.body?.email ?? "");
    const code = String(req.body?.code ?? "");
    if (!email || !code) throw ApiError.badRequest("Informe e-mail e código");
    const valid = await verifyEmailCode(email, code);
    if (!valid) throw ApiError.badRequest("Código inválido ou expirado");
    return ok(res, { verified: true });
  }),
);

/**
 * POST /auth/signup — cria empresa + usuário (após e-mail verificado).
 * Retorna token com a empresa ativa (PENDING_PAYMENT) para seguir ao checkout.
 */
authRouter.post(
  "/signup",
  asyncHandler(async (req: Request, res: Response) => {
    const {
      email,
      password,
      businessName,
      responsibleName,
      phone,
      segment,
      planId,
      cpfCnpj,
    } = req.body ?? {};
    const created = await createBusinessFromSignup({
      email,
      password,
      businessName,
      responsibleName,
      phone,
      segment,
      planId: planId ? String(planId) : undefined,
      cpfCnpj: cpfCnpj ? String(cpfCnpj) : undefined,
    });

    const user = await prisma.user.findUnique({
      where: { id: created.userId },
    });
    if (!user) throw ApiError.badRequest("Falha ao recuperar usuário criado");

    const token = await signToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      must_change_password: user.must_change_password,
      platform_role: user.platform_role,
      businessId: created.businessId,
      businessRole: "OWNER",
    });

    void writeAudit({
      actor: user.id,
      businessId: created.businessId,
      action: "auth.signup",
      entity: "Business",
      entityId: created.businessId,
    });

    logger.info("Cadastro concluído com verificação de e-mail", {
      businessId: created.businessId,
      email: user.email,
    });

    return ok(
      res,
      {
        token,
        user: toPublicUser(user),
        active_business: { id: created.businessId, status: "PENDING_PAYMENT" },
        requires_payment: true,
      },
      201,
    );
  }),
);
