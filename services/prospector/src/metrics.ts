/**
 * Métricas em memória do Prospector.
 * Preparadas para exposição/agregação quando houver dezenas/centenas de tenants.
 */
import { createLogger } from "@prospector/logger";

const logger = createLogger("prospector.metrics");

export interface ProspectorMetricsSnapshot {
  jobsTotal: number;
  jobsCompleted: number;
  jobsFailed: number;
  jobsCancelled: number;
  leadsFound: number;
  leadsSaved: number;
  duplicates: number;
  crawlErrors: number;
  firecrawlErrors: number;
  averageJobDurationMs: number;
  averageLeadsPerJob: number;
  startedAt: string;
}

export interface MetricsEvent {
  type:
    | "start"
    | "complete"
    | "failed"
    | "cancelled"
    | "found"
    | "saved"
    | "duplicate"
    | "crawl_error";
  jobId?: string;
  durationMs?: number;
  foundDelta?: number;
  savedDelta?: number;
}

class ProspectorMetrics {
  private jobsTotal = 0;
  private jobsCompleted = 0;
  private jobsFailed = 0;
  private jobsCancelled = 0;
  private leadsFound = 0;
  private leadsSaved = 0;
  private duplicates = 0;
  private crawlErrors = 0;
  private firecrawlErrors = 0;
  private durations: number[] = [];
  private startedAt = new Date().toISOString();

  record(event: MetricsEvent): void {
    switch (event.type) {
      case "start":
        this.jobsTotal += 1;
        break;
      case "complete":
        this.jobsCompleted += 1;
        if (event.durationMs) this.durations.push(event.durationMs);
        break;
      case "failed":
        this.jobsFailed += 1;
        break;
      case "cancelled":
        this.jobsCancelled += 1;
        break;
      case "found":
        this.leadsFound += event.foundDelta ?? 0;
        break;
      case "saved":
        this.leadsSaved += event.savedDelta ?? 0;
        break;
      case "duplicate":
        this.duplicates += 1;
        break;
      case "crawl_error":
        this.crawlErrors += 1;
        break;
      default:
        break;
    }
  }

  snapshot(): ProspectorMetricsSnapshot {
    const completed = this.durations.length;
    const averageJobDurationMs =
      completed === 0
        ? 0
        : Math.round(this.durations.reduce((a, b) => a + b, 0) / completed);
    const averageLeadsPerJob =
      this.jobsCompleted === 0
        ? 0
        : Math.round((this.leadsSaved / this.jobsCompleted) * 10) / 10;
    return {
      jobsTotal: this.jobsTotal,
      jobsCompleted: this.jobsCompleted,
      jobsFailed: this.jobsFailed,
      jobsCancelled: this.jobsCancelled,
      leadsFound: this.leadsFound,
      leadsSaved: this.leadsSaved,
      duplicates: this.duplicates,
      crawlErrors: this.crawlErrors,
      firecrawlErrors: this.firecrawlErrors,
      averageJobDurationMs,
      averageLeadsPerJob,
      startedAt: this.startedAt,
    };
  }

  logSnapshot(): void {
    logger.info("PROSPECTOR_METRICS", { ...this.snapshot() });
  }
}

export const prospectorMetrics = new ProspectorMetrics();
