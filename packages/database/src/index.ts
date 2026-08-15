import { PrismaClient } from '@prisma/client';
import { createLogger } from '@prospector/logger';

const logger = createLogger('database');

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export async function checkDatabaseConnection(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
  logger.info('Conexão com o banco de dados verificada');
}

export * from '@prisma/client';
export { prisma as default };
