import 'dotenv/config';
import { config } from '@prospector/config';
import { createLogger } from '@prospector/logger';
import { checkDatabaseConnection, prisma } from '@prospector/database';
import { createApp } from './app';
import { realtimeService } from './services/realtime';

const logger = createLogger('api');

async function bootstrap(): Promise<void> {
  await checkDatabaseConnection();

  const app = createApp();
  const port = config.ports.api;

  const server = app.listen(port, () => {
    logger.info(`API SAVYRON rodando na porta ${port}`, {
      env: config.env,
      url: `http://localhost:${port}`,
    });
  });

  realtimeService.init(server);

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Recebido ${signal} — encerrando API`);
    await realtimeService
      .close()
      .catch((error) => logger.warn('Falha ao encerrar realtime', { error: String(error) }));
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((error) => {
  logger.error('Falha ao iniciar a API', { error });
  process.exit(1);
});
