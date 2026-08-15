import express, { Express, Request } from "express";
import helmet from "helmet";
import { config } from "@prospector/config";
import { createLogger } from "@prospector/logger";
import { getWhatsAppManager, whatsappRegistry } from "@prospector/whatsapp";
import { prospectorMetrics } from "@prospector/prospector";

const logger = createLogger("worker.server");

/** Servidor de controle do worker (porta 5005). Autenticado por token. */
export function createControlServer(): Express {
  const app = express();
  app.use(helmet());
  app.use(express.json({ limit: "1mb" }));

  app.use((req, res, next) => {
    const token = req.headers["x-worker-token"];
    if (token !== config.app.apiToken) {
      res
        .status(401)
        .json({
          success: false,
          error: { code: "UNAUTHORIZED", message: "Token inválido" },
        });
      return;
    }
    next();
  });

  app.get("/health", (_req, res) => {
    res.json({ success: true, service: "worker", uptime: process.uptime() });
  });

  app.get("/prospector/metrics", (_req, res) => {
    res.json({ success: true, data: prospectorMetrics.snapshot() });
  });

  app.get("/prospector/config", (_req, res) => {
    res.json({
      success: true,
      data: {
        concurrency: config.prospector.concurrency,
        minDelayMs: config.prospector.minDelayMs,
        maxDelayMs: config.prospector.maxDelayMs,
        maxPagesPerDomain: config.prospector.maxPagesPerDomain,
        maxResultsPerSearch: config.prospector.maxResultsPerSearch,
        maxLeadsPerRun: config.prospector.maxLeadsPerRun,
        batchSize: config.prospector.batchSize,
        retryAttempts: config.prospector.retryAttempts,
        provider: config.prospector.provider,
        firecrawlConfigured: Boolean(config.prospector.firecrawlApiKey),
        overpassConfigured: true,
        rateLimitPerMinute: config.prospector.rateLimitPerMinute,
      },
    });
  });

  app.get("/whatsapp/status", (req: Request, res) => {
    const businessId = (req.query.businessId as string) || undefined;
    const manager = getWhatsAppManager(businessId);
    res.json({
      success: true,
      businessId: businessId ?? null,
      data: manager.getStatus(),
    });
  });

  app.get("/whatsapp/qr", (req: Request, res) => {
    const businessId = (req.query.businessId as string) || undefined;
    const status = getWhatsAppManager(businessId).getStatus();
    res.json({
      success: true,
      businessId: businessId ?? null,
      data: {
        qr: status.qr,
        available: status.qrAvailable,
        state: status.state,
      },
    });
  });

  app.post("/whatsapp/connect", async (req: Request, res) => {
    const businessId = (req.body.businessId as string | undefined) || undefined;
    const status = await getWhatsAppManager(businessId).connect();
    res.json({ success: true, businessId: businessId ?? null, data: status });
  });

  app.post("/whatsapp/disconnect", async (req: Request, res) => {
    const businessId = (req.body.businessId as string | undefined) || undefined;
    const status = await getWhatsAppManager(businessId).disconnect();
    res.json({ success: true, businessId: businessId ?? null, data: status });
  });

  /**
   * POST /whatsapp/clear-session — desconecta e apaga TODOS os arquivos de
   * sessão do WhatsApp da empresa (força novo QR de pareamento).
   */
  app.post("/whatsapp/clear-session", async (req: Request, res) => {
    const businessId = (req.body.businessId as string | undefined) || undefined;
    const manager = getWhatsAppManager(businessId);
    const status = await manager.clearSession();
    whatsappRegistry.remove(businessId);
    res.json({ success: true, businessId: businessId ?? null, data: status });
  });

  return app;
}

export function startControlServer(port: number): void {
  const app = createControlServer();
  app.listen(port, () => {
    logger.info(`Worker control server rodando na porta ${port}`);
  });
}
