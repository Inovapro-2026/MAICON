import { prisma } from '@prospector/database';
import { ReportMetrics } from '@prospector/types';

export interface ReportRange {
  from: Date;
  to: Date;
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 10000) / 100;
}

export async function getReportMetrics(range: ReportRange, businessId: string): Promise<ReportMetrics> {
  const from = range.from;
  const to = range.to;

  const [sentCount, sentByDate, respondedByDate, interestedByDate, optOuts, respondedLeads] =
    await Promise.all([
      prisma.message.count({ where: { direction: 'OUT', business_id: businessId, created_at: { gte: from, lte: to } } }),
      prisma.message.groupBy({
        by: ['created_at'],
        where: { direction: 'OUT', business_id: businessId, created_at: { gte: from, lte: to } },
        _count: { _all: true },
      }),
      prisma.message.groupBy({
        by: ['created_at'],
        where: { direction: 'IN', business_id: businessId, created_at: { gte: from, lte: to } },
        _count: { _all: true },
      }),
      prisma.lead.groupBy({
        by: ['updated_at'],
        where: { status: 'INTERESTED', business_id: businessId, updated_at: { gte: from, lte: to } },
        _count: { _all: true },
      }),
      prisma.optOut.count({ where: { business_id: businessId, created_at: { gte: from, lte: to } } }),
      prisma.message.groupBy({
        by: ['lead_id'],
        where: { direction: 'IN', business_id: businessId, created_at: { gte: from, lte: to } },
        _count: { _all: true },
      }),
    ]);

  const totalResponded = respondedLeads.length;
  const totalSent = sentCount;
  const totalInterested = interestedByDate.reduce((acc, r) => acc + r._count._all, 0);

  // Série diária
  const dayIndex = new Map<string, { date: string; sent: number; responded: number; interested: number }>();
  const dayKey = (d: Date): string => d.toISOString().slice(0, 10);

  for (let cursor = new Date(from); cursor <= to; cursor.setDate(cursor.getDate() + 1)) {
    dayIndex.set(dayKey(cursor), { date: dayKey(cursor), sent: 0, responded: 0, interested: 0 });
  }

  for (const row of sentByDate) {
    const key = dayKey(row.created_at);
    const entry = dayIndex.get(key);
    if (entry) entry.sent += row._count._all;
  }
  for (const row of respondedByDate) {
    const key = dayKey(row.created_at);
    const entry = dayIndex.get(key);
    if (entry) entry.responded += row._count._all;
  }
  for (const row of interestedByDate) {
    const key = dayKey(row.updated_at);
    const entry = dayIndex.get(key);
    if (entry) entry.interested += row._count._all;
  }

  return {
    period: { from: from.toISOString(), to: to.toISOString() },
    response_rate: pct(totalResponded, totalSent),
    interest_rate: pct(totalInterested, totalSent),
    conversion_rate: pct(totalInterested, totalResponded),
    opt_out_rate: pct(optOuts, totalSent),
    total_sent: totalSent,
    total_responded: totalResponded,
    total_interested: totalInterested,
    total_opt_out: optOuts,
    series: [...dayIndex.values()],
  };
}
