import { Router, Request, Response } from "express";
import { prisma } from "@prospector/database";
import { createLogger } from "@prospector/logger";
import { asyncHandler, ok } from "../lib/http";
import { requireAuth, requireBusiness } from "../middleware/auth";

const logger = createLogger("api.clients");

/**
 * CLIENTES — a entidade Cliente é o próprio `Lead` (não duplica dados): um
 * telefone = um cliente por tenant (business_id). Um cliente é um lead que já
 * possui ao menos uma conversa. Memória (nome, segmento, status) é isolada por
 * business_id — nunca uma query sem `WHERE business_id`.
 */
export const clientsRouter = Router();

clientsRouter.use(requireAuth, requireBusiness);

/** GET /clients — lista clientes (leads com conversa) com busca e paginação. */
clientsRouter.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = Math.min(100, Number(req.query.pageSize ?? 24));
    const search = String(req.query.search ?? "").trim();

    const where: Record<string, unknown> = {
      business_id: businessId,
      conversations: { some: {} },
    };
    if (search) {
      const like = { contains: search, mode: "insensitive" as const };
      where.OR = [
        { name: like },
        { phone: like },
        { segment: like },
        { business_name: like },
      ];
    }

    const [total, leads] = await Promise.all([
      prisma.lead.count({ where }),
      prisma.lead.findMany({
        where,
        orderBy: { updated_at: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          name: true,
          phone: true,
          segment: true,
          business_name: true,
          status: true,
          updated_at: true,
          conversations: {
            select: { id: true, stage: true, status: true, last_message_at: true },
          },
        },
      }),
    ]);

    const clients = leads.map((l) => ({
      id: l.id,
      name: l.name,
      phone: l.phone,
      segment: l.segment,
      business_name: l.business_name,
      status: l.status,
      conversation: l.conversations[0] ?? null,
    }));

    logger.debug("Clientes listados", { business_id: businessId, total, page, pageSize });
    return ok(res, { total, page, pageSize, clients });
  })
);

/** GET /clients/:id — detalhe do cliente (sempre filtrado por business_id). */
clientsRouter.get(
  "/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const id = String(req.params.id);
    const client = await prisma.lead.findFirst({
      where: { id, business_id: businessId },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        business_name: true,
        city: true,
        state: true,
        segment: true,
        status: true,
        created_at: true,
        updated_at: true,
        conversations: {
          select: { id: true, stage: true, status: true, last_message_at: true },
        },
      },
    });
    if (!client) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Cliente não encontrado" },
      });
    }
    return ok(res, client);
  })
);

/**
 * GET /clients/:id/conversation — abre a conversa EXISTENTE do cliente.
 * NUNCA cria uma conversa a partir deste clique: se não houver vínculo,
 * retorna 404 (a UI mostra "Nenhuma conversa vinculada").
 */
clientsRouter.get(
  "/:id/conversation",
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const id = String(req.params.id);
    const conversation = await prisma.conversation.findFirst({
      where: { business_id: businessId, lead_id: id },
      select: { id: true },
    });
    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Nenhuma conversa vinculada a este cliente" },
      });
    }
    return ok(res, { conversationId: conversation.id });
  })
);