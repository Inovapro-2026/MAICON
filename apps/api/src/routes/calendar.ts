import { Router, Request, Response } from 'express';
import { prisma } from '@prospector/database';
import { createLogger } from '@prospector/logger';
import { asyncHandler, ok, ApiError } from '../lib/http';
import { requireAuth, requireBusiness } from '../middleware/auth';

const logger = createLogger('api.calendar');

export const calendarRouter = Router();

calendarRouter.use(requireAuth, requireBusiness);

calendarRouter.get('/events', asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId!;
  const userId = req.user!.sub;
  const startDate = req.query.start ? new Date(String(req.query.start)) : new Date();
  const endDate = req.query.end ? new Date(String(req.query.end)) : new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);
  const status = req.query.status ? String(req.query.status) : undefined;

  const where: any = { business_id: businessId, user_id: userId, start_date: { gte: startDate, lte: endDate } };
  if (status) where.status = status;

  const events = await prisma.calendarEvent.findMany({
    where, orderBy: { start_date: 'asc' },
    select: { id: true, title: true, description: true, start_date: true, end_date: true, all_day: true, category: true, priority: true, status: true, recurrence: true, reminder_minutes_before: true, created_at: true, updated_at: true },
  });

  return ok(res, { events, total: events.length });
}));

calendarRouter.post('/events', asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId!;
  const userId = req.user!.sub;
  const { title, description, start_date, end_date, all_day, category, priority, recurrence, reminder_minutes_before } = req.body;

  if (!title || !start_date) throw ApiError.badRequest('Título e data de início são obrigatórios');

  const event = await prisma.calendarEvent.create({
    data: { business_id: businessId, user_id: userId, title, description, start_date: new Date(start_date), end_date: end_date ? new Date(end_date) : null, all_day: Boolean(all_day), category, priority: priority || 'NORMAL', recurrence: recurrence || 'NONE', reminder_minutes_before: reminder_minutes_before ? Number(reminder_minutes_before) : null },
  });

  logger.info('Evento criado via UI', { event_id: event.id, business_id: businessId });
  return ok(res, { event });
}));

calendarRouter.put('/events/:id', asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId!;
  const userId = req.user!.sub;
  const { id } = req.params;

  const existing = await prisma.calendarEvent.findFirst({ where: { id, business_id: businessId, user_id: userId } });
  if (!existing) throw ApiError.notFound('Evento não encontrado');

  const data: any = {};
  const fields = ['title', 'description', 'start_date', 'end_date', 'all_day', 'category', 'priority', 'status', 'recurrence', 'reminder_minutes_before'];
  for (const f of fields) {
    if (req.body[f] !== undefined) data[f] = f.endsWith('_date') ? new Date(req.body[f]) : req.body[f];
  }

  const event = await prisma.calendarEvent.update({ where: { id }, data });
  return ok(res, { event });
}));

calendarRouter.delete('/events/:id', asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId!;
  const userId = req.user!.sub;
  const { id } = req.params;

  const existing = await prisma.calendarEvent.findFirst({ where: { id, business_id: businessId, user_id: userId } });
  if (!existing) throw ApiError.notFound('Evento não encontrado');

  await prisma.calendarEvent.delete({ where: { id } });
  return ok(res, { message: 'Evento removido' });
}));

calendarRouter.get('/reminders', asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId!;
  const userId = req.user!.sub;
  const status = String(req.query.status ?? 'PENDING');

  const where: any = { business_id: businessId, user_id: userId };
  if (status === 'PENDING') { where.status = 'PENDING'; where.remind_at = { gte: new Date() }; }
  else where.status = status;

  const reminders = await prisma.reminder.findMany({
    where, orderBy: { remind_at: 'asc' }, take: 50,
    select: { id: true, title: true, description: true, remind_at: true, recurring: true, recurrence: true, status: true, completed_at: true, created_at: true },
  });

  return ok(res, { reminders, total: reminders.length });
}));

calendarRouter.post('/reminders', asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId!;
  const userId = req.user!.sub;
  const { title, description, remind_at, recurring, recurrence } = req.body;

  if (!title || !remind_at) throw ApiError.badRequest('Título e data são obrigatórios');

  const reminder = await prisma.reminder.create({
    data: { business_id: businessId, user_id: userId, title, description, remind_at: new Date(remind_at), recurring: Boolean(recurring), recurrence: recurrence || 'NONE' },
  });

  return ok(res, { reminder });
}));

calendarRouter.put('/reminders/:id', asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId!;
  const userId = req.user!.sub;
  const { id } = req.params;

  const existing = await prisma.reminder.findFirst({ where: { id, business_id: businessId, user_id: userId } });
  if (!existing) throw ApiError.notFound('Lembrete não encontrado');

  const data: any = {};
  if (req.body.title !== undefined) data.title = req.body.title;
  if (req.body.description !== undefined) data.description = req.body.description;
  if (req.body.remind_at !== undefined) data.remind_at = new Date(req.body.remind_at);
  if (req.body.status !== undefined) data.status = req.body.status;
  if (req.body.recurring !== undefined) data.recurring = Boolean(req.body.recurring);

  const reminder = await prisma.reminder.update({ where: { id }, data });
  return ok(res, { reminder });
}));

calendarRouter.delete('/reminders/:id', asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId!;
  const userId = req.user!.sub;
  const { id } = req.params;

  const existing = await prisma.reminder.findFirst({ where: { id, business_id: businessId, user_id: userId } });
  if (!existing) throw ApiError.notFound('Lembrete não encontrado');

  await prisma.reminder.delete({ where: { id } });
  return ok(res, { message: 'Lembrete removido' });
}));