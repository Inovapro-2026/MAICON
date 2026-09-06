import { Router, Request, Response } from 'express';
import { prisma } from '@prospector/database';
import { createLogger } from '@prospector/logger';
import { asyncHandler, ok, ApiError } from '../lib/http';
import { requireAuth, requireBusiness } from '../middleware/auth';

const logger = createLogger('api.memory');
const MEMORY_EXPIRY_DAYS = 30;

export const memoryRouter = Router();

memoryRouter.use(requireAuth, requireBusiness);

memoryRouter.get('/', asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId!;
  const userId = req.user!.sub;
  const category = req.query.category ? String(req.query.category) : undefined;
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);

  const where: any = { business_id: businessId, user_id: userId, expires_at: { gte: new Date() } };
  if (category) where.category = category;

  const memories = await prisma.memory.findMany({
    where, orderBy: [{ importance: 'desc' }, { created_at: 'desc' }], take: limit,
    select: { id: true, content: true, category: true, importance: true, source: true, created_at: true, expires_at: true },
  });

  return ok(res, { memories, total: memories.length });
}));

memoryRouter.post('/', asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId!;
  const userId = req.user!.sub;
  const { content, category, importance } = req.body;

  if (!content) throw ApiError.badRequest('Conteúdo é obrigatório');

  const expiresAt = new Date(Date.now() + MEMORY_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const memory = await prisma.memory.create({
    data: { business_id: businessId, user_id: userId, content, category: category || 'NOTE', importance: Math.min(Math.max(Number(importance) || 1, 1), 5), expires_at: expiresAt, source: 'manual' },
  });

  return ok(res, { memory });
}));

memoryRouter.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId!;
  const userId = req.user!.sub;
  const { id } = req.params;

  const existing = await prisma.memory.findFirst({ where: { id, business_id: businessId, user_id: userId } });
  if (!existing) throw ApiError.notFound('Memória não encontrada');

  await prisma.memory.delete({ where: { id } });
  return ok(res, { message: 'Memória removida' });
}));

memoryRouter.get('/search', asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId!;
  const userId = req.user!.sub;
  const query = String(req.query.q || '').trim();
  if (!query) throw ApiError.badRequest('Termo de busca é obrigatório');

  const memories = await prisma.memory.findMany({
    where: { business_id: businessId, user_id: userId, expires_at: { gte: new Date() }, content: { contains: query, mode: 'insensitive' } },
    orderBy: [{ importance: 'desc' }, { created_at: 'desc' }], take: 20,
    select: { id: true, content: true, category: true, importance: true, created_at: true },
  });

  return ok(res, { memories, total: memories.length });
}));