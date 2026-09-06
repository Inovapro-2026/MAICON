import { Router, Request, Response } from 'express';
import { prisma } from '@prospector/database';
import { createLogger } from '@prospector/logger';
import { asyncHandler, ok, ApiError } from '../lib/http';
import { requireAuth, requireBusiness } from '../middleware/auth';

const logger = createLogger('api.financial');

export const financialRouter = Router();

financialRouter.use(requireAuth, requireBusiness);

financialRouter.get('/categories', asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId!;
  const type = req.query.type ? String(req.query.type) : undefined;

  const where: any = { business_id: businessId };
  if (type) where.type = type;

  const categories = await prisma.financialCategory.findMany({ where, orderBy: { name: 'asc' } });
  return ok(res, { categories });
}));

financialRouter.post('/categories', asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId!;
  const { name, type, color } = req.body;

  if (!name || !type) throw ApiError.badRequest('Nome e tipo são obrigatórios');

  const category = await prisma.financialCategory.create({
    data: { business_id: businessId, name, type, color },
  });

  return ok(res, { category });
}));

financialRouter.get('/transactions', asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId!;
  const userId = req.user!.sub;
  const type = req.query.type ? String(req.query.type) : undefined;
  const status = req.query.status ? String(req.query.status) : undefined;
  const startDate = req.query.start ? new Date(String(req.query.start)) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const endDate = req.query.end ? new Date(String(req.query.end)) : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59);
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);

  const where: any = { business_id: businessId, user_id: userId, date: { gte: startDate, lte: endDate } };
  if (type) where.type = type;
  if (status) where.status = status;

  const transactions = await prisma.financialTransaction.findMany({
    where, orderBy: { date: 'desc' }, take: limit,
    include: { category: { select: { id: true, name: true, color: true } } },
  });

  const summary = await Promise.all([
    prisma.financialTransaction.aggregate({ where: { ...where, type: 'INCOME', status: { in: ['REAL', 'PLANNED'] as any } }, _sum: { amount: true } }),
    prisma.financialTransaction.aggregate({ where: { ...where, type: 'EXPENSE', status: { in: ['REAL', 'PLANNED'] as any } }, _sum: { amount: true } }),
  ]);

  return ok(res, {
    transactions: transactions.map(t => ({ id: t.id, type: t.type, description: t.description, amount: Number(t.amount), date: t.date, category: t.category?.name ?? null, category_id: t.category_id, status: t.status, recurrence: t.recurrence, notes: t.notes, created_at: t.created_at })),
    total: transactions.length,
    summary: { income: Number(summary[0]._sum.amount || 0), expenses: Number(summary[1]._sum.amount || 0), balance: Number(summary[0]._sum.amount || 0) - Number(summary[1]._sum.amount || 0) },
  });
}));

financialRouter.post('/transactions', asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId!;
  const userId = req.user!.sub;
  const { type, description, amount, date, category_id, recurrence, notes, status } = req.body;

  if (!type || !description || amount === undefined || !date) throw ApiError.badRequest('Tipo, descrição, valor e data são obrigatórios');

  const isFuture = new Date(date) > new Date();
  const transaction = await prisma.financialTransaction.create({
    data: { business_id: businessId, user_id: userId, type, description, amount, date: new Date(date), category_id: category_id || null, recurrence: recurrence || 'NONE', notes, status: status || (isFuture ? 'PLANNED' : 'REAL') },
  });

  return ok(res, { transaction });
}));

financialRouter.put('/transactions/:id', asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId!;
  const { id } = req.params;

  const existing = await prisma.financialTransaction.findFirst({ where: { id, business_id: businessId } });
  if (!existing) throw ApiError.notFound('Transação não encontrada');

  const data: any = {};
  const fields = ['type', 'description', 'amount', 'date', 'category_id', 'recurrence', 'status', 'notes'];
  for (const f of fields) {
    if (req.body[f] !== undefined) data[f] = f === 'date' ? new Date(req.body[f]) : req.body[f];
  }

  const transaction = await prisma.financialTransaction.update({ where: { id }, data });
  return ok(res, { transaction });
}));

financialRouter.delete('/transactions/:id', asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId!;
  const { id } = req.params;

  const existing = await prisma.financialTransaction.findFirst({ where: { id, business_id: businessId } });
  if (!existing) throw ApiError.notFound('Transação não encontrada');

  await prisma.financialTransaction.delete({ where: { id } });
  return ok(res, { message: 'Transação removida' });
}));

financialRouter.get('/summary', asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId!;
  const userId = req.user!.sub;

  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

  const [currentIncome, currentExpense, currentPlannedIncome, currentPlannedExpense, lastIncome, lastExpense, categories] = await Promise.all([
    prisma.financialTransaction.aggregate({ where: { business_id: businessId, user_id: userId, type: 'INCOME', date: { gte: currentMonthStart, lte: currentMonthEnd }, status: 'REAL' as any }, _sum: { amount: true } }),
    prisma.financialTransaction.aggregate({ where: { business_id: businessId, user_id: userId, type: 'EXPENSE', date: { gte: currentMonthStart, lte: currentMonthEnd }, status: 'REAL' as any }, _sum: { amount: true } }),
    prisma.financialTransaction.aggregate({ where: { business_id: businessId, user_id: userId, type: 'INCOME', date: { gte: currentMonthStart, lte: currentMonthEnd }, status: 'PLANNED' as any }, _sum: { amount: true } }),
    prisma.financialTransaction.aggregate({ where: { business_id: businessId, user_id: userId, type: 'EXPENSE', date: { gte: currentMonthStart, lte: currentMonthEnd }, status: 'PLANNED' as any }, _sum: { amount: true } }),
    prisma.financialTransaction.aggregate({ where: { business_id: businessId, user_id: userId, type: 'INCOME', date: { gte: lastMonthStart, lte: lastMonthEnd }, status: 'REAL' as any }, _sum: { amount: true } }),
    prisma.financialTransaction.aggregate({ where: { business_id: businessId, user_id: userId, type: 'EXPENSE', date: { gte: lastMonthStart, lte: lastMonthEnd }, status: 'REAL' as any }, _sum: { amount: true } }),
    prisma.financialCategory.findMany({ where: { business_id: businessId } }),
  ]);

  const realIncome = Number(currentIncome._sum.amount || 0);
  const realExpense = Number(currentExpense._sum.amount || 0);
  const plannedIncome = Number(currentPlannedIncome._sum.amount || 0);
  const plannedExpense = Number(currentPlannedExpense._sum.amount || 0);

  return ok(res, {
    current_month: {
      income: realIncome + plannedIncome,
      expenses: realExpense + plannedExpense,
      balance: (realIncome + plannedIncome) - (realExpense + plannedExpense),
      realized: { income: realIncome, expenses: realExpense },
      planned: { income: plannedIncome, expenses: plannedExpense },
    },
    last_month: {
      income: Number(lastIncome._sum.amount || 0),
      expenses: Number(lastExpense._sum.amount || 0),
      balance: Number(lastIncome._sum.amount || 0) - Number(lastExpense._sum.amount || 0),
    },
    planned: {
      income: plannedIncome,
      expenses: plannedExpense,
    },
    categories,
  });
}));