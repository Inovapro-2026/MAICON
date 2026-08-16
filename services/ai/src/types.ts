export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GenerateOptions {
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  /** Solicita resposta em JSON estruturado (response_format json_object). */
  jsonMode?: boolean;
  /**
   * Provedor preferido para esta chamada (análise → groq; geração → nvidia).
   * Se não configurado ou falhar, o gerenciador cai para os demais provedores.
   */
  provider?: "groq" | "openrouter";
}

export interface ProviderResult {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export interface LLMProvider {
  readonly name: "groq" | "openrouter";
  isConfigured(): boolean;
  generate(
    messages: ChatMessage[],
    options?: GenerateOptions,
  ): Promise<ProviderResult>;
}

/** Erro tipado que o provider-manager usa para decidir o fallback. */
export class ProviderError extends Error {
  readonly provider: string;
  readonly retryable: boolean;
  readonly status: number | null;

  constructor(
    provider: string,
    message: string,
    options?: { retryable?: boolean; status?: number },
  ) {
    super(message);
    this.name = "ProviderError";
    this.provider = provider;
    this.retryable = options?.retryable ?? true;
    this.status = options?.status ?? null;
  }
}
