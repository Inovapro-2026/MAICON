/**
 * Configuração central da aplicação.
 * Lê variáveis de ambiente e expõe defaults tipados.
 */
import * as dotenv from "dotenv";
import { join, resolve } from "path";

const ROOT_DIR = resolve(join(__dirname, "..", "..", ".."));

// Carrega o .env da raiz do monorepo (funciona independente do CWD do processo)
dotenv.config({ path: join(ROOT_DIR, ".env") });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return value;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] || fallback;
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) ? fallback : n;
}

export const config = {
  rootDir: ROOT_DIR,
  env: process.env.NODE_ENV || "development",

  database: {
    url: required("DATABASE_URL"),
  },

  redis: {
    url: optional("REDIS_URL", "redis://localhost:6379"),
  },

  ai: {
    // NVIDIA NIM é o provedor PRIMÁRIO; Groq e OpenRouter ficam como fallback.
    nvidiaApiKey: optional("NVIDIA_API_KEY"),
    nvidiaModel: optional("NVIDIA_MODEL", "moonshotai/kimi-k3"),
    nvidiaBaseUrl: optional("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1"),
    openaiApiKey: optional("OPENAI_API_KEY"),
    openaiModel: optional("OPENAI_MODEL", "gpt-4o-mini"),
    groqApiKey: optional("GROQ_API_KEY"),
    groqModel: optional("GROQ_MODEL", "llama-3.1-8b-instant"),
    openrouterApiKey: optional("OPENROUTER_API_KEY"),
    openrouterModel: optional("OPENROUTER_MODEL", "nvidia/nemotron-3-super-120b-a12b:free"),
    timeoutMs: int("AI_TIMEOUT_MS", 30000),
    maxMessageLength: int("AI_MAX_MESSAGE_LENGTH", 600),
    /**
     * Delay natural entre mensagens fracionadas (1ª → 2ª) no WhatsApp.
     * Aleatório dentro do intervalo para parecer humano.
     */
    messageSplitDelayMinMs: int("AI_MESSAGE_SPLIT_DELAY_MIN_MS", 800),
    messageSplitDelayMaxMs: int("AI_MESSAGE_SPLIT_DELAY_MAX_MS", 1800),
    // Agente de voz (ABA "Agente")
    elevenlabsApiKey: optional("ELEVENLABS_API_KEY"),
    agentVoiceId: optional("AGENT_VOICE_ID", "EXAVITQu4vr4xnSDxMaL"),
    agentModel: optional("AGENT_MODEL", "openai/gpt-oss-120b"),
  },

  /**
   * Conversation Learning Engine — limites para a inteligência comercial por
   * tenant. Uma conversa isolada NUNCA altera o comportamento: somente
   * estratégias com amostras/confiança suficientes (e status ACTIVE) são
   * usadas automaticamente pelo Decision Engine.
   */
  learning: {
    // Amostras mínimas para a estratégia sair de LEARNING para ACTIVE.
    minSamplesActive: int("LEARNING_MIN_SAMPLES_ACTIVE", 30),
    // Continuidade mínima (respostas substantivas) para ativar.
    minContinuityActive: int("LEARNING_MIN_CONTINUITY_ACTIVE", 50),
    // Confiança mínima (0-100) para uso automático pelo Decision Engine.
    minConfidence: int("LEARNING_MIN_CONFIDENCE", 60),
    // Abaixo desta continuidade a estratégia é descartada (com amostras suficientes).
    discardContinuity: int("LEARNING_DISCARD_CONTINUITY", 20),
    // A cada N mensagens recebidas a conversa é analisada incrementalmente.
    analyzeEveryMessages: int("LEARNING_ANALYZE_EVERY_MESSAGES", 4),
  },

  email: {
    resendApiKey: optional("RESEND_API_KEY"),
    fromEmail: optional("RESEND_FROM_EMAIL", "contato@inovapro.shop"),
    fromName: optional("EMAIL_FROM_NAME", "SAVYRON"),
  },

  stripe: {
    secretKey: optional("STRIPE_SECRET_KEY"),
    publishableKey: optional("STRIPE_PUBLISHABLE_KEY"),
    webhookSecret: optional("STRIPE_WEBHOOK_SECRET"),
    paymentMethodConfigurationId: optional(
      "STRIPE_PAYMENT_METHOD_CONFIGURATION_ID",
    ),
  },

  cakto: {
    clientId: optional("CAKTO_CLIENT_ID"),
    clientSecret: optional("CAKTO_CLIENT_SECRET"),
    webhookSecret: optional("CAKTO_WEBHOOK_SECRET"),
    baseUrl: optional("CAKTO_API_BASE_URL", "https://api.cakto.com.br"),
  },

  abacatepay: {
    apiKey: optional("ABACATEPAY_API_KEY"),
    webhookSecret: optional("ABACATEPAY_WEBHOOK_SECRET"),
    webhookEndpoint: optional(
      "ABACATEPAY_WEBHOOK_ENDPOINT",
      "https://crm.inovapro.cloud/api/webhooks/abacatepay",
    ),
    apiBaseUrl: optional(
      "ABACATEPAY_API_BASE_URL",
      "https://api.abacatepay.com/v2",
    ),
  },

  whatsapp: {
    sessionPath: optional("WHATSAPP_SESSION_PATH", join(ROOT_DIR, "session")),
  },

  app: {
    url: optional("NEXT_PUBLIC_APP_URL", "http://localhost:3005"),
    apiBaseUrl: optional("API_BASE_URL", "http://localhost:4005"),
    dashboardUrl: optional("DASHBOARD_URL", "http://localhost:3005"),
    workerBaseUrl: optional("WORKER_BASE_URL", "http://localhost:5005"),
    sessionSecret: required("SESSION_SECRET"),
    apiToken: required("API_TOKEN"),
    adminEmail: optional("ADMIN_EMAIL", "ceo.inovapro@maicon"),
    adminPassword: optional("ADMIN_PASSWORD", "Inovapro$2026"),
  },

  campaign: {
    defaultWhatsappDailyLimit: int("DEFAULT_WHATSAPP_DAILY_LIMIT", 30),
    defaultEmailDailyLimit: int("DEFAULT_EMAIL_DAILY_LIMIT", 100),
    defaultIntervalSeconds: int("DEFAULT_INTERVAL_SECONDS", 7200),
    testModeMaxLeads: int("TEST_MODE_MAX_LEADS", 5),
  },

  prospector: {
    /**
     * Provedor de descoberta: 'firecrawl' | 'overpass' | 'auto'.
     * - firecrawl: usa apenas Firecrawl; sem FIRECRAWL_API_KEY lança erro claro.
     * - overpass: usa apenas Overpass API (OSM), gratuito, sem chave.
     * - auto (padrão): Firecrawl se a chave existir; caso contrário, Overpass.
     */
    provider: optional("PROSPECTOR_PROVIDER", "auto"),
    firecrawlApiKey: optional("FIRECRAWL_API_KEY"),
    firecrawlBaseUrl: optional(
      "FIRECRAWL_API_BASE_URL",
      "https://api.firecrawl.dev",
    ),
    concurrency: int("PROSPECTOR_CONCURRENCY", 3),
    minDelayMs: int("PROSPECTOR_MIN_DELAY_MS", 1500),
    maxDelayMs: int("PROSPECTOR_MAX_DELAY_MS", 4000),
    maxPagesPerDomain: int("PROSPECTOR_MAX_PAGES_PER_DOMAIN", 5),
    maxResultsPerSearch: int("PROSPECTOR_MAX_RESULTS_PER_SEARCH", 20),
    jobTimeoutMs: int("PROSPECTOR_JOB_TIMEOUT_MS", 15 * 60 * 1000),
    requestTimeoutMs: int("PROSPECTOR_REQUEST_TIMEOUT_MS", 60000),
    retryAttempts: int("PROSPECTOR_RETRY_ATTEMPTS", 3),
    maxLeadsPerRun: int("PROSPECTOR_MAX_LEADS_PER_RUN", 500),
    maxActivePerTenant: int("PROSPECTOR_MAX_ACTIVE_PER_TENANT", 1),
    maxPendingPerTenant: int("PROSPECTOR_MAX_PENDING_PER_TENANT", 3),
    batchSize: int("PROSPECTOR_BATCH_SIZE", 10),
    rateLimitPerMinute: int("PROSPECTOR_RATE_LIMIT_PER_MINUTE", 30),
    rateLimitWindowMs: int("PROSPECTOR_RATE_LIMIT_WINDOW_MS", 60000),
    rateLimitPerTenantPerHour: int(
      "PROSPECTOR_RATE_LIMIT_PER_TENANT_PER_HOUR",
      100,
    ),
    overpassApiUrl: optional(
      "OVERPASS_API_URL",
      "https://overpass-api.de/api/interpreter",
    ),
    overpassTimeoutMs: int("OVERPASS_TIMEOUT_MS", 60000),
    overpassRetryAttempts: int("OVERPASS_RETRY_ATTEMPTS", 2),
    nominatimApiUrl: optional(
      "NOMINATIM_API_URL",
      "https://nominatim.openstreetmap.org",
    ),
    scrapyServiceUrl: optional("SCRAPY_SERVICE_URL", "http://localhost:6810"),
    scrapyConcurrency: int("SCRAPY_CONCURRENCY", 2),
    scrapyRequestDelayMs: int("SCRAPY_REQUEST_DELAY_MS", 1000),
    /**
     * Prospecção multi-plataforma via Apify (pago por evento).
     * `apiToken` é obrigatório para ativar as fontes Apify; sem token, o job
     * de prospecção Apify falha de forma VISÍVEL (nunca contador zerado).
     */
    apify: {
      apiToken: optional("APIFY_API_TOKEN"),
      actorGoogleMaps: optional(
        "APIFY_ACTOR_GOOGLE_MAPS",
        "compass/google-maps-extractor",
      ),
      actorInstagram: optional(
        "APIFY_ACTOR_INSTAGRAM",
        "apify/instagram-scraper",
      ),
      maxCrawledPlacesPerSearch: int("APIFY_MAX_CRAWLED_PLACES_PER_SEARCH", 20),
      maxInstagramProfiles: int("APIFY_MAX_INSTAGRAM_PROFILES", 30),
      requestTimeoutMs: int("APIFY_REQUEST_TIMEOUT_MS", 120000),
      pollIntervalMs: int("APIFY_POLL_INTERVAL_MS", 5000),
    },
  },

  ports: {
    dashboard: int("DASHBOARD_PORT", 3005),
    api: int("API_PORT", 4005),
    worker: int("WORKER_PORT", 5005),
  },

  security: {
    rateLimitWindowMs: int("RATE_LIMIT_WINDOW_MS", 60000),
    rateLimitMax: int("RATE_LIMIT_MAX", 120),
  },
} as const;

export type AppConfig = typeof config;
