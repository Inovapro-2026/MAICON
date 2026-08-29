import { prisma } from "@prospector/database";
import { createLogger } from "@prospector/logger";
import { redis, acquireLock, releaseLock } from "./redis";

const logger = createLogger("worker.subscription-watchdog");

/**
 * Intervalo entre varreduras de expiração de assinaturas (ms).
 * A cada 60s verifica assinaturas ACTIVE vencidas e suspende a empresa.
 * SEM período de carência: venceu, suspende.
 */
const WATCHDOG_INTERVAL_MS = 60_000;
const LOCK_KEY = "subscription:expiry:lock";
const SUSPENSION_REASON = "subscription_expired";

/**
 * SubscriptionExpiryWatchdog — varredura periódica que detecta assinaturas
 * ACTIVE cujo current_period_end já passou e aplica a suspensão automática:
 *   - Subscription -> EXPIRED
 *   - Business -> SUSPENDED + suspension_reason='subscription_expired'
 * (o login redireciona essas empresas para /payment para renovarem o plano).
 * Nunca suspende por decisão local sem o vencimento real; paga volta com a
 * confirmação do gateway (webhook transparent.completed).
 */
export class SubscriptionExpiryWatchdog {
  private timer: ReturnType<typeof setInterval> | null = null;

  start(): void {
    if (this.timer) return;
    logger.info("SubscriptionExpiryWatchdog iniciado", {
      intervalMs: WATCHDOG_INTERVAL_MS,
    });

    // Roda imediatamente ao iniciar para recuperar vencidos pós-restart
    void this.runExpiryCheck();

    this.timer = setInterval(() => {
      void this.runExpiryCheck();
    }, WATCHDOG_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info("SubscriptionExpiryWatchdog parado");
    }
  }

  private async runExpiryCheck(): Promise<void> {
    // Lock distribuído: evita corrida entre instâncias do worker.
    if (!(await acquireLock(LOCK_KEY, 60_000))) return;

    try {
      const now = new Date();
      const expired = await prisma.subscription.findMany({
        where: {
          status: "ACTIVE",
          current_period_end: { lt: now },
        },
        select: { id: true, business_id: true, current_period_end: true },
      });

      if (expired.length === 0) return;

      let suspended = 0;
      for (const subscription of expired) {
        try {
          const business = await prisma.business.findUnique({
            where: { id: subscription.business_id },
            select: { status: true },
          });
          // Respeita empresas já suspensas/canceladas manualmente pelo admin.
          if (
            !business ||
            business.status === "SUSPENDED" ||
            business.status === "CANCELLED"
          ) {
            continue;
          }

          await prisma.$transaction([
            prisma.subscription.update({
              where: { id: subscription.id },
              data: { status: "EXPIRED" },
            }),
            prisma.business.update({
              where: { id: subscription.business_id },
              data: {
                status: "SUSPENDED",
                suspension_reason: SUSPENSION_REASON,
              },
            }),
          ]);

          await prisma.auditLog
            .create({
              data: {
                actor: "abi-watchdog",
                business_id: subscription.business_id,
                action: "subscription.expired_by_watchdog",
                entity: "Subscription",
                entity_id: subscription.id,
                metadata: {
                  reason: SUSPENSION_REASON,
                  status: "EXPIRED",
                  period_end: subscription.current_period_end?.toISOString(),
                },
              },
            })
            .catch(() => {});

          suspended++;
          logger.info("Assinatura expirada pelo watchdog", {
            businessId: subscription.business_id,
            subscriptionId: subscription.id,
            periodEnd: subscription.current_period_end?.toISOString(),
          });
        } catch (innerError) {
          logger.error("Watchdog: erro ao expirar assinatura", {
            subscription_id: subscription.id,
            error:
              innerError instanceof Error
                ? innerError.message
                : String(innerError),
          });
        }
      }

      if (suspended > 0) {
        logger.info("Watchdog: expiração concluída", {
          checked: expired.length,
          suspended,
        });
      }
    } catch (error) {
      logger.error("Watchdog: erro na varredura de expiração", {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      await releaseLock(LOCK_KEY);
    }
  }
}

export const subscriptionExpiryWatchdog = new SubscriptionExpiryWatchdog();
