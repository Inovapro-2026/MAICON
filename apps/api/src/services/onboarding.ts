/**
 * Onboarding — cadastro com verificação de e-mail, criação de empresa e
 * assinatura inicial (SAVYRON). Segurança: código de 6 dígitos com salt,
 * expiração, tentativas limitadas, uso único e checagem de e-mail verificado.
 */
import { createHash, randomInt } from "crypto";
import { prisma } from "@prospector/database";
import { resendService } from "@prospector/email";
import { buildOtpEmail } from "@prospector/email";
import { createLogger } from "@prospector/logger";
import { ApiError } from "../lib/http";
import { hashPassword } from "./password";
import { writeAudit } from "./audit";

const logger = createLogger("api.onboarding");

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_MIN_MS = 30 * 1000;
export const OTP_MAX_PER_EMAIL_HOUR = 8;

function hashOtpCode(code: string, salt: string): string {
  return createHash("sha256").update(`${code}::${salt}`).digest("hex");
}

function newOtpSalt(): string {
  return randomInt(100000000, 999999999).toString();
}

/** Gera e envia um código de verificação, guardando somente o hash. */
export async function sendVerificationCode(email: string): Promise<void> {
  const normalized = email.toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw ApiError.badRequest("E-mail inválido");
  }

  // Rate limit por e-mail/hora (evita flood de mensagens)
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const sentInHour = await prisma.emailVerification.count({
    where: { email: normalized, created_at: { gte: hourAgo } },
  });
  if (sentInHour >= OTP_MAX_PER_EMAIL_HOUR) {
    throw ApiError.tooManyRequests(
      "Muitos códigos solicitados. Tente novamente mais tarde.",
    );
  }

  // Rate limit de reenvio
  const last = await prisma.emailVerification.findFirst({
    where: { email: normalized },
    orderBy: { created_at: "desc" },
  });
  if (last && Date.now() - last.created_at.getTime() < OTP_RESEND_MIN_MS) {
    throw ApiError.tooManyRequests(
      "Aguarde alguns segundos para reenviar o código.",
    );
  }

  const code = randomInt(100000, 999999).toString();
  const salt = newOtpSalt();
  const stored = `${salt}::${hashOtpCode(code, salt)}`;

  await prisma.emailVerification.create({
    data: {
      email: normalized,
      code_hash: stored,
      expires_at: new Date(Date.now() + OTP_TTL_MS),
    },
  });

  try {
    const tpl = buildOtpEmail(code, OTP_TTL_MS / 60000);
    await resendService.send({
      to: normalized,
      subject: tpl.subject,
      text: tpl.text,
      html: tpl.html,
    });
  } catch (error) {
    logger.error("Falha ao enviar código de verificação", {
      email: normalized,
      error,
    });
    throw ApiError.badRequest(
      "Não foi possível enviar o e-mail. Tente novamente.",
    );
  }
}

/**
 * Valida um código para um e-mail. Incrementa tentativas; marca como verificado
 * (uso único) e invalida o hash ao acertar. Retorna boolean.
 */
export async function verifyEmailCode(
  email: string,
  code: string,
): Promise<boolean> {
  const normalized = email.toLowerCase().trim();
  const latest = await prisma.emailVerification.findFirst({
    where: { email: normalized },
    orderBy: { created_at: "desc" },
  });
  if (!latest) return false;
  if (latest.verified_at) return false;
  if (latest.expires_at.getTime() < Date.now()) return false;
  if (latest.attempts >= OTP_MAX_ATTEMPTS) return false;

  const [storedSalt, storedHash] = (latest.code_hash ?? "").split("::");
  const expected = hashOtpCode(String(code).trim(), storedSalt || "");
  if (storedHash && expected !== storedHash) {
    await prisma.emailVerification.update({
      where: { id: latest.id },
      data: { attempts: latest.attempts + 1 },
    });
    return false;
  }
  if (!storedHash) {
    // compatibilidade: hash antigo sem salt
    const rawHash = createHash("sha256")
      .update(String(code).trim())
      .digest("hex");
    if (rawHash !== latest.code_hash) {
      await prisma.emailVerification.update({
        where: { id: latest.id },
        data: { attempts: latest.attempts + 1 },
      });
      return false;
    }
  }

  await prisma.emailVerification.update({
    where: { id: latest.id },
    data: { verified_at: new Date(), code_hash: "used" },
  });
  return true;
}

export interface SignupBusinessInput {
  email: string;
  password: string;
  businessName: string;
  responsibleName: string;
  phone?: string;
  segment?: string;
  planId?: string;
  cpfCnpj?: string;
}

/**
 * Cria o usuário + empresa (status PENDING_PAYMENT) + membership OWNER +
 * assinatura inicial vinculada ao plano. Exige e-mail verificado.
 * Retorna a empresa criada e o assinante.
 */
export async function createBusinessFromSignup(
  input: SignupBusinessInput,
): Promise<{
  userId: string;
  businessId: string;
  subscriptionId: string;
}> {
  const email = input.email.toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw ApiError.badRequest("E-mail inválido");
  const passwordError =
    input.password.length < 8
      ? "A senha deve ter pelo menos 8 caracteres"
      : !/[A-Z]/.test(input.password)
        ? "A senha deve ter pelo menos uma letra maiúscula"
        : !/[0-9]/.test(input.password)
          ? "A senha deve ter pelo menos um número"
          : null;
  if (passwordError) throw ApiError.badRequest(passwordError);
  if (!input.businessName?.trim())
    throw ApiError.badRequest("Informe o nome da empresa");

  // E-mail precisa ter sido verificado
  const verified = await prisma.emailVerification.findFirst({
    where: { email, verified_at: { not: null } },
    orderBy: { created_at: "desc" },
  });
  if (!verified) throw ApiError.badRequest("E-mail não verificado");

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) throw ApiError.conflict("Este e-mail já está em uso");

  const password_hash = await hashPassword(input.password);

  const plan = input.planId
    ? await prisma.plan.findUnique({ where: { id: input.planId } })
    : await prisma.plan.findFirst({
        where: { active: true, price: { gt: 0 } },
        orderBy: { sort_order: "asc" },
      });
  if (!plan || !plan.active)
    throw ApiError.badRequest("Selecione um plano ativo");
  if (Number(plan.price) <= 0)
    throw ApiError.badRequest(
      "Este plano não está mais disponível para novos cadastros",
    );

  const slugBase = makeSlug(input.businessName);
  const slug = await uniqueSlug(slugBase);

  const now = new Date();
  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        password_hash,
        name: input.responsibleName?.trim() || email.split("@")[0],
        role: "ADMIN",
        platform_role: "NONE",
        must_change_password: false,
      },
    });

    const business = await tx.business.create({
      data: {
        name: input.businessName.trim(),
        slug,
        status: "PENDING_PAYMENT",
        segment: input.segment?.trim() || null,
        email,
        phone: input.phone?.trim() || null,
        cnpj: input.cpfCnpj ? input.cpfCnpj.replace(/\D/g, "") : null,
        created_at: now,
        updated_at: now,
      },
    });

    await tx.businessSettings.create({
      data: { business_id: business.id, updated_at: now, created_at: now },
    });

    await tx.businessMember.create({
      data: { business_id: business.id, user_id: user.id, role: "OWNER" },
    });

    // Toda conta nova nasce com a própria campanha pronta (regra 1 campanha
    // por empresa), usando o nome da empresa como título. Nasce ACTIVE — sem
    // leads na fila nada é disparado; ao importar leads, começa a enviar.
    await tx.campaign.create({
      data: {
        business_id: business.id,
        name: input.businessName.trim(),
        status: "ACTIVE",
        daily_whatsapp_limit: 30,
        daily_email_limit: 100,
        interval_seconds: 7200,
        start_hour: 8,
        channel_mode: "WHATSAPP",
      },
    });

    const subscription = await tx.subscription.create({
      data: {
        business_id: business.id,
        plan_id: plan.id,
        status: "TRIALING",
        plan_name: plan.name,
        plan_price: plan.price as unknown as number,
        created_at: now,
        updated_at: now,
      },
    });

    return {
      userId: user.id,
      businessId: business.id,
      subscriptionId: subscription.id,
    };
  });

  void writeAudit({
    actor: created.userId,
    businessId: created.businessId,
    action: "business.created",
    entity: "Business",
    entityId: created.businessId,
    metadata: { plan: plan.slug, status: "PENDING_PAYMENT" },
  });

  logger.info("Empresa criada via signup", {
    businessId: created.businessId,
    plan: plan.slug,
  });

  return created;
}

function makeSlug(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "empresa";
}

async function uniqueSlug(base: string): Promise<string> {
  const candidate = `${base}-${Date.now().toString(36)}`;
  return candidate;
}
