import { Router, Request, Response } from 'express';
import { prisma } from '@prospector/database';
import { createLogger } from '@prospector/logger';
import { asyncHandler, ok, ApiError } from '../lib/http';
import { requireAuth, requireBusiness, requireRole } from '../middleware/auth';
import { getBusinessSettings, setBusinessSettings } from '../services/settings';
import { writeAudit } from '../services/audit';

const logger = createLogger('api.business');

export const businessRouter = Router();

businessRouter.use(requireAuth, requireBusiness);

/**
 * GET /business/settings — visão combinada da empresa (Business + BusinessSettings).
 * businessId derivado do token; leitura permitida a qualquer membro autenticado.
 */
businessRouter.get(
  '/settings',
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
    if (!business) throw ApiError.notFound('Empresa não encontrada');

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
      timezone: settings?.timezone ?? 'America/Sao_Paulo',
      logo_url: settings?.logo_url ?? null,
      additional_info: settings?.additional_info ?? null,
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
  })
);

/**
 * PATCH /business/settings — atualiza dados da empresa.
 * Apenas OWNER/BUSINESS_ADMIN. businessId SEMPRE do token (nunca do payload).
 */
businessRouter.patch(
  '/settings',
  requireRole(['OWNER', 'BUSINESS_ADMIN']),
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const body = req.body ?? {};

    // Campos do Business
    const businessData: Record<string, unknown> = {};
    const businessFields = ['name', 'legal_name', 'trade_name', 'cnpj', 'segment', 'description', 'email', 'phone'] as const;
    for (const field of businessFields) {
      if (body[field] !== undefined) businessData[field] = body[field];
    }
    if (Object.keys(businessData).length > 0) {
      await prisma.business.update({ where: { id: businessId }, data: businessData });
    }

    // Campos do BusinessSettings
    await setBusinessSettings(businessId, {
      ...(body.address !== undefined ? { address: body.address || null } : {}),
      ...(body.website !== undefined ? { website: body.website || null } : {}),
      ...(body.instagram !== undefined ? { instagram: body.instagram || null } : {}),
      ...(body.opening_hours !== undefined ? { opening_hours: body.opening_hours || null } : {}),
      ...(body.timezone !== undefined ? { timezone: String(body.timezone || 'America/Sao_Paulo') } : {}),
      ...(body.logo_url !== undefined ? { logo_url: body.logo_url || null } : {}),
      ...(body.additional_info !== undefined ? { additional_info: body.additional_info || null } : {}),
    });

    void writeAudit({
      actor: req.user!.sub,
      businessId,
      action: 'business.settings.updated',
      entity: 'Business',
      entityId: businessId,
      metadata: { fields: [...Object.keys(businessData), 'address', 'website', 'instagram', 'opening_hours', 'timezone', 'logo_url', 'additional_info'].filter((f) => body[f] !== undefined) },
    });

    logger.info('Configurações da empresa atualizadas', { businessId });

    return ok(res, { message: 'Configurações atualizadas' });
  })
);