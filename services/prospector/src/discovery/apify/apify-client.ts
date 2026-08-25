/**
 * Cliente HTTP da API do Apify (fetch nativo — sem dependência extra).
 *
 * Fluxo: inicia a run do actor → aguarda conclusão (polling) → lista os itens
 * do dataset. Qualquer erro de autenticação (401), rate limit (429) ou falha
 * do actor lança erro — o job NUNCA retorna contador zerado como se tivesse
 * funcionado (lição do incidente Firecrawl).
 */
import { createLogger } from "@prospector/logger";

const logger = createLogger("prospector.apify-client");

export interface ApifyRunOutput<T> {
  items: T[];
  actorRunId: string;
  datasetId: string;
  usageCount: number;
}

interface ApifyRunStatus {
  status: string;
  defaultDatasetId?: string;
}

export class ApifyError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(`Apify: HTTP ${status} ${message}`);
    this.name = "ApifyError";
    this.status = status;
  }
}

export class ApifyClientOptions {
  apiToken!: string;
  actorId!: string;
  requestTimeoutMs: number;
  pollIntervalMs: number;
  constructor(opts: {
    apiToken: string;
    actorId: string;
    requestTimeoutMs?: number;
    pollIntervalMs?: number;
  }) {
    this.apiToken = opts.apiToken;
    this.actorId = opts.actorId;
    this.requestTimeoutMs = opts.requestTimeoutMs ?? 120000;
    this.pollIntervalMs = opts.pollIntervalMs ?? 5000;
  }
}

export class ApifyActorClient {
  private readonly token: string;
  private readonly actorId: string;
  private readonly timeoutMs: number;
  private readonly pollIntervalMs: number;
  private readonly base = "https://api.apify.com/v2";

  constructor(options: ApifyClientOptions) {
    this.token = options.apiToken;
    this.actorId = options.actorId;
    this.timeoutMs = options.requestTimeoutMs;
    this.pollIntervalMs = options.pollIntervalMs;
  }

  /** Inicia a run do actor e retorna { runId, defaultDatasetId }. */
  async startRun(input: Record<string, unknown>): Promise<{
    runId: string;
    defaultDatasetId?: string;
  }> {
    const url = `${this.base}/acts/${encodeURIComponent(this.actorId)}/runs?token=${this.token}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new ApifyError(res.status, body.slice(0, 300));
    }
    const data = (await res.json()) as {
      data?: { id?: string; defaultDatasetId?: string };
    };
    const runId = data?.data?.id;
    if (!runId) throw new Error("Apify: resposta sem run id");
    logger.info("APIFY_RUN_STARTED", { actorId: this.actorId, runId });
    return { runId, defaultDatasetId: data?.data?.defaultDatasetId };
  }

  /** Aguarda o término da run (SUCCEEDED) até o timeout do job. */
  async waitForRun(runId: string, timeoutMs: number): Promise<ApifyRunStatus> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const res = await fetch(
        `${this.base}/actor-runs/${runId}?token=${this.token}`,
        { signal: AbortSignal.timeout(this.timeoutMs) },
      );
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new ApifyError(res.status, body.slice(0, 300));
      }
      const data = (await res.json()) as {
        data?: { status?: string; defaultDatasetId?: string; errorMessage?: string };
      };
      const status = data?.data?.status ?? "";
      if (status === "SUCCEEDED") {
        return { status, defaultDatasetId: data?.data?.defaultDatasetId };
      }
      if (["FAILED", "TIMED-OUT", "ABORTED"].includes(status)) {
        const msg = data?.data?.errorMessage ?? `status ${status}`;
        throw new Error(`Apify: run ${runId} falhou (${msg})`);
      }
      if (Date.now() >= deadline) {
        throw new Error(`Apify: run ${runId} estourou o timeout do job`);
      }
      await new Promise((r) => setTimeout(r, this.pollIntervalMs));
    }
  }

  /** Lista os itens do dataset. */
  async listItems<T>(datasetId: string): Promise<T[]> {
    const url = `${this.base}/datasets/${datasetId}/items?token=${this.token}&format=json&limit=100000`;
    const res = await fetch(url, { signal: AbortSignal.timeout(this.timeoutMs) });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new ApifyError(res.status, body.slice(0, 300));
    }
    return (await res.json()) as T[];
  }

  /**
   * Executa o actor ponta a ponta: start → wait → items.
   * Lança em qualquer falha (visível ao job) — nunca retorna zero silencioso.
   */
  async run<T>(input: Record<string, unknown>): Promise<ApifyRunOutput<T>> {
    const started = Date.now();
    const { runId, defaultDatasetId } = await this.startRun(input);
    const run = await this.waitForRun(runId, this.timeoutMs);
    const datasetId = run.defaultDatasetId ?? defaultDatasetId;
    if (!datasetId) {
      throw new Error("Apify: run concluída sem dataset");
    }
    const items = await this.listItems<T>(datasetId);
    logger.info("APIFY_RUN_DONE", {
      actorId: this.actorId,
      runId,
      datasetId,
      items: items.length,
      duration_ms: Date.now() - started,
    });
    return { items, actorRunId: runId, datasetId, usageCount: items.length };
  }
}
