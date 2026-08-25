import { Router, Request, Response } from "express";
import { prisma } from "@prospector/database";
import { createLogger } from "@prospector/logger";
import { asyncHandler, ok, ApiError } from "../lib/http";
import { requireAuth, requireBusiness, requireRole } from "../middleware/auth";
import { getBusinessSettings, setBusinessSettings } from "../services/settings";
import { writeAudit } from "../services/audit";
import {
  applyAIConfiguration,
  getAIConfigurationStatus,
} from "../services/ai-config";

const logger = createLogger("api.business");

export const businessRouter = Router();

businessRouter.use(requireAuth, requireBusiness);

/**
 * GET /business/settings — visão combinada da empresa (Business + BusinessSettings).
 * businessId derivado do token; leitura permitida a qualquer membro autenticado.
 */
businessRouter.get(
  "/settings",
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const [business, settings, subscription] = await Promise.all([
      prisma.business.findUnique({ where: { id: businessId } }),
      getBusinessSettings(businessId),
      prisma.subscription.findUnique({
        where: { business_id: businessId },
        select: { plan: { include: { features: true } } },
      }),
    ]);
    if (!business) throw ApiError.notFound("Empresa não encontrada");

    const plan = subscription?.plan ?? null;

    return ok(res, {
      name: business.name,
      legal_name: business.legal_name,
      trade_name: business.trade_name,
      cnpj: business.cnpj,
      segment: business.segment,
      description: business.description,
      email: business.email,
      phone: business.phone,
      address: settings?.address ?? null,
      website: settings?.website ?? null,
      instagram: settings?.instagram ?? null,
      opening_hours: settings?.opening_hours ?? null,
      timezone: settings?.timezone ?? "America/Sao_Paulo",
      logo_url: settings?.logo_url ?? null,
      additional_info: settings?.additional_info ?? null,
      target_audience: settings?.target_audience ?? null,
      problems_solved: settings?.problems_solved ?? null,
      differentials: settings?.differentials ?? null,
      positioning: settings?.positioning ?? null,
      service_area: settings?.service_area ?? null,
      business_objectives: settings?.business_objectives ?? null,
      additional_instructions: settings?.additional_instructions ?? null,
      limits: {
        whatsapp_daily_limit: settings?.whatsapp_daily_limit ?? 30,
        email_daily_limit: settings?.email_daily_limit ?? 100,
        interval_seconds: settings?.interval_seconds ?? 7200,
        test_mode_max_leads: settings?.test_mode_max_leads ?? 5,
      },
      plan: plan
        ? {
            id: plan.id,
            name: plan.name,
            slug: plan.slug,
            features: Object.fromEntries(
              plan.features.map((f) => [f.feature, f.enabled]),
            ),
          }
        : null,
    });
  }),
);

/**
 * PATCH /business/settings — atualiza dados da empresa.
 * Apenas OWNER/BUSINESS_ADMIN. businessId SEMPRE do token (nunca do payload).
 */
businessRouter.patch(
  "/settings",
  requireRole(["OWNER", "BUSINESS_ADMIN"]),
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const body = req.body ?? {};

    // Campos do Business
    const businessData: Record<string, unknown> = {};
    const businessFields = [
      "name",
      "legal_name",
      "trade_name",
      "cnpj",
      "segment",
      "description",
      "email",
      "phone",
    ] as const;
    for (const field of businessFields) {
      if (body[field] !== undefined) businessData[field] = body[field];
    }
    if (Object.keys(businessData).length > 0) {
      await prisma.business.update({
        where: { id: businessId },
        data: businessData,
      });
    }

    // Campos do BusinessSettings
    await setBusinessSettings(businessId, {
      ...(body.address !== undefined ? { address: body.address || null } : {}),
      ...(body.website !== undefined ? { website: body.website || null } : {}),
      ...(body.instagram !== undefined
        ? { instagram: body.instagram || null }
        : {}),
      ...(body.opening_hours !== undefined
        ? { opening_hours: body.opening_hours || null }
        : {}),
      ...(body.timezone !== undefined
        ? { timezone: String(body.timezone || "America/Sao_Paulo") }
        : {}),
      ...(body.logo_url !== undefined
        ? { logo_url: body.logo_url || null }
        : {}),
      ...(body.additional_info !== undefined
        ? { additional_info: body.additional_info || null }
        : {}),
      ...(body.target_audience !== undefined
        ? { target_audience: body.target_audience || null }
        : {}),
      ...(body.problems_solved !== undefined
        ? { problems_solved: body.problems_solved || null }
        : {}),
      ...(body.differentials !== undefined
        ? { differentials: body.differentials || null }
        : {}),
      ...(body.positioning !== undefined
        ? { positioning: body.positioning || null }
        : {}),
      ...(body.service_area !== undefined
        ? { service_area: body.service_area || null }
        : {}),
      ...(body.business_objectives !== undefined
        ? { business_objectives: body.business_objectives || null }
        : {}),
      ...(body.additional_instructions !== undefined
        ? { additional_instructions: body.additional_instructions || null }
        : {}),
    });

    void writeAudit({
      actor: req.user!.sub,
      businessId,
      action: "business.settings.updated",
      entity: "Business",
      entityId: businessId,
      metadata: {
        fields: [
          ...Object.keys(businessData),
          "address",
          "website",
          "instagram",
          "opening_hours",
          "timezone",
          "logo_url",
          "additional_info",
        ].filter((f) => body[f] !== undefined),
      },
    });

    logger.info("Configurações da empresa atualizadas", { businessId });

    return ok(res, { message: "Configurações atualizadas" });
  }),
);

/**
 * GET /business/ai-config-status — status da configuração automática na IA.
 * Indica se a configuração estruturada já foi aplicada e quando.
 */
businessRouter.get(
  "/ai-config-status",
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const status = await getAIConfigurationStatus(businessId);
    return ok(res, status);
  }),
);

/**
 * POST /business/apply-ai-config — aplica os dados da empresa na IA.
 * O backend envia os dados para o provider de IA (Groq), que devolve uma
 * configuração ESTRUTURADA (JSON). O JSON NUNCA é retornado ao usuário — apenas
 * a confirmação + timestamp. Reaplicar atualiza a configuração existente.
 */
businessRouter.post(
  "/apply-ai-config",
  requireRole(["OWNER", "BUSINESS_ADMIN"]),
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const body = req.body ?? {};

    const name = String(body.name ?? "")
      .trim()
      .slice(0, 200);
    const segment = String(body.segment ?? "")
      .trim()
      .slice(0, 120);
    if (!name) throw ApiError.badRequest("Informe o nome da empresa");
    if (!segment) throw ApiError.badRequest("Selecione o segmento da empresa");

    const result = await applyAIConfiguration(businessId, {
      name,
      segment,
      email: body.email ? String(body.email).slice(0, 200) : undefined,
      phone: body.phone ? String(body.phone).slice(0, 40) : undefined,
      description: body.description
        ? String(body.description).slice(0, 15000)
        : undefined,
      website: body.site ? String(body.site).slice(0, 200) : undefined,
      instagram: body.instagram
        ? String(body.instagram).slice(0, 200)
        : undefined,
      openingHours: body.horario
        ? String(body.horario).slice(0, 300)
        : undefined,
      location: body.localizacao
        ? String(body.localizacao).slice(0, 300)
        : undefined,
      targetAudience: body.publico
        ? String(body.publico).slice(0, 2000)
        : undefined,
      problemsSolved: body.problemas
        ? String(body.problemas).slice(0, 2000)
        : undefined,
      differentials: body.diferenciais
        ? String(body.diferenciais).slice(0, 2000)
        : undefined,
      positioning: body.posicionamento
        ? String(body.posicionamento).slice(0, 2000)
        : undefined,
      serviceArea: body.area_atendimento
        ? String(body.area_atendimento).slice(0, 500)
        : undefined,
      businessObjectives: body.objetivo
        ? String(body.objetivo).slice(0, 500)
        : undefined,
      additionalInstructions: body.instrucoes
        ? String(body.instrucoes).slice(0, 15000)
        : undefined,
    });


    void writeAudit({
      actor: req.user!.sub,
      businessId,
      action: "business.ai-config.applied",
      entity: "AISettings",
      entityId: businessId,
      metadata: { applied: true },
    });

    return ok(res, {
      applied: result.applied,
      lastAppliedAt: result.lastAppliedAt,
    });
  }),
);
