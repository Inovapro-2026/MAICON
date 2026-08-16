import express, { Express, NextFunction, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import { createLogger } from "@prospector/logger";
import { healthRouter } from "./routes/health";
import { authRouter } from "./routes/auth";
import { leadsRouter } from "./routes/leads";
import { prospectingRouter } from "./routes/prospecting";
import { campaignsRouter } from "./routes/campaigns";
import { dashboardRouter } from "./routes/dashboard";
import { inboxRouter } from "./routes/inbox";
import { reportsRouter } from "./routes/reports";
import { whatsappRouter } from "./routes/whatsapp";
import { webhooksRouter } from "./routes/webhooks";
import { billingRouter } from "./routes/billing";
import { adminRouter } from "./routes/admin";
import { businessRouter } from "./routes/business";
import { aiRouter } from "./routes/ai";
import { emailsRouter } from "./routes/emails";
import { clientsRouter } from "./routes/clients";
import { errorHandler } from "./middleware/error-handler";
import { rateLimit } from "./middleware/rate-limit";
import { initQueues } from "./services/queues";
import { config } from "@prospector/config";

const logger = createLogger("api.app");

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: [config.app.dashboardUrl, config.app.url, /\.inovapro\.cloud$/],
      credentials: true,
    }),
  );
  // Captura o body bruto APENAS no webhook do Stripe (necessário para validar a
  // assinatura usando o payload exato como string). Escopo por caminho para não
  // impedir o express.json() de parsear o body nos demais endpoints.
  app.use(
    "/webhooks/stripe",
    express.raw({
      type: "*/*",
      limit: "10mb",
      verify: (req: Request, _res, buf, encoding) => {
        if (buf?.length) (req as Request & { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));

  // Rate limit global (exceto webhooks)
  const globalRateLimit = rateLimit();
  app.use((req, res, next) => {
    if (req.path.startsWith("/webhooks")) return next();
    return globalRateLimit(req, res, next);
  });

  initQueues();

  app.get("/", (_req, res) => {
    res.json({ service: "SAVYRON API", docs: "/health" });
  });

  app.use("/health", healthRouter);
  app.use("/auth", authRouter);
  app.use("/leads", prospectingRouter);
  app.use("/leads", leadsRouter);
  app.use("/campaigns", campaignsRouter);
  app.use("/dashboard", dashboardRouter);
  app.use("/conversations", inboxRouter);
  app.use("/reports", reportsRouter);
  app.use("/whatsapp", whatsappRouter);
  app.use("/webhooks", webhooksRouter);
  app.use("/billing", billingRouter);
  app.use("/admin", adminRouter);
  app.use("/business", businessRouter);
  app.use("/ai", aiRouter);
  app.use("/emails", emailsRouter);
  app.use("/clients", clientsRouter);

  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Rota não encontrada" },
    });
  });

  app.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
    logger.debug("Entrando no error handler", { path: req.path });
    errorHandler(error, req, res, next);
  });

  return app;
}
