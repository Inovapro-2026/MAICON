/**
 * Integração Cakto (novo gateway de pagamento do SAVYRON — PIX recorrente).
 *
 * Runtime da aplicação: autentica via OAuth2 (client_id/client_secret) e monta
 * o link fixo de checkout pré-preenchido (https://pay.cakto.com.br/{offer_id}).
 * Setup administrativo (produtos, ofertas, webhook endpoint) é feito via MCP.
 *
 * Regras críticas:
 * - NUNCA expor client_secret/access_token no frontend.
 * - A Cakto NÃO assina o webhook: validação pelo campo `secret` no corpo.
 * - Correlação da compra à empresa via `sck=biz_{businessId}` (retorna em
 *   `data.sck`). Fallback por `data.customer.email`.
 * - NUNCA ativar Business/Subscription sem confirmação real do gateway
 *   (purchase_approved / subscription_renewed).
 */
import { config } from "@prospector/config";
import { createLogger } from "@prospector/logger";
import crypto from "node:crypto";

const logger = createLogger("api.cakto");

export class CaktoNotConfiguredError extends Error {
  constructor() {
    super("Cakto não configurado (CAKTO_CLIENT_ID/CAKTO_CLIENT_SECRET ausentes)");
    this.name = "CaktoNotConfiguredError";
  }
}

export function isCaktoConfigured(): boolean {
  return Boolean(
    config.cakto.clientId?.trim() && config.cakto.clientSecret?.trim(),
  );
}

export function getCaktoBaseUrl(): string {
  return config.cakto.baseUrl?.trim() || "https://api.cakto.com.br";
}

// Cache do access token (singleton por processo).
let _accessToken: string | null = null;
let _tokenExpiresAt = 0;
const TOKEN_SLACK_MS = 60_000;

async function fetchAccessToken(): Promise<string> {
  if (!isCaktoConfigured()) throw new CaktoNotConfiguredError();
  const url = `${getCaktoBaseUrl()}/public_api/token/`;
  const body = new URLSearchParams({
    client_id: config.cakto.clientId!,
    client_secret: config.cakto.clientSecret!,
  });
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    logger.error("Falha ao obter token Cakto", { status: res.status });
    throw new Error(`Cakto: falha na autenticação (${res.status})`);
  }
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) throw new Error("Cakto: token ausente na resposta");
  _accessToken = data.access_token;
  _tokenExpiresAt = Date.now() + (data.expires_in ?? 36000) * 1000;
  return _accessToken;
}

/** Retorna o access token, renovando se expirado. */
export async function getCaktoAccessToken(): Promise<string> {
  if (_accessToken && Date.now() < _tokenExpiresAt - TOKEN_SLACK_MS) {
    return _accessToken;
  }
  return fetchAccessToken();
}

/** Headers autenticados para chamadas à API Cakto. */
export async function caktoHeaders(): Promise<Record<string, string>> {
  const token = await getCaktoAccessToken();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

/**
 * Valida o `secret` recebido no corpo do webhook contra o configurado.
 * Usa timingSafeEqual (buffers do mesmo tamanho) — NUNCA compara strings.
 */
export function isCaktoWebhookSecretValid(received: unknown): boolean {
  const expected = config.cakto.webhookSecret?.trim();
  if (!expected) return false;
  const receivedStr = typeof received === "string" ? received : "";
  const a = Buffer.from(receivedStr);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function isCaktoWebhookConfigured(): boolean {
  return Boolean(config.cakto.webhookSecret?.trim());
}

/**
 * Monta a URL do checkout Cakto pré-preenchida com os dados do comprador.
 * `sck` (não `src`) é o campo que a Cakto retorna no webhook (data.sck) e é
 * usado para correlacionar a compra à empresa (sck=biz_{businessId}).
 */
export function buildCaktoCheckoutUrl(input: {
  offerId: string;
  businessId: string;
  name?: string | null;
  email?: string | null;
  cpfCnpj?: string | null;
  phone?: string | null;
}): string {
  const base = `https://pay.cakto.com.br/${input.offerId}`;
  const params = new URLSearchParams();
  if (input.name) params.set("name", input.name);
  if (input.email) {
    params.set("email", input.email);
    params.set("confirmEmail", input.email);
  }
  if (input.cpfCnpj) params.set("cpf", input.cpfCnpj);
  if (input.phone) params.set("phone", input.phone);
  params.set("sck", `biz_${input.businessId}`);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/**
 * Atualiza o preço de uma oferta Cakto (PUT /public_api/offers/{id}/).
 * Atualização PARCIAL: envia apenas { price }. Necessário escopo `write offers`.
 * O checkout Cakto exibe o preço da OFERTA — por isso, ao mudar o preço do
 * plano no painel, a oferta vinculada precisa ser sincronizada para o link
 * de pagamento refletir o novo valor.
 */
export async function updateCaktoOfferPrice(
  offerId: string,
  price: number,
): Promise<void> {
  if (!isCaktoConfigured()) throw new CaktoNotConfiguredError();
  const headers = await caktoHeaders();
  const res = await fetch(
    `${getCaktoBaseUrl()}/public_api/offers/${encodeURIComponent(offerId)}/`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify({ price }),
    },
  );
  if (!res.ok) {
    const detail = await res.text();
    logger.error("Falha ao atualizar oferta Cakto", {
      offerId,
      price,
      status: res.status,
      detail,
    });
    throw new Error(`Cakto: falha ao atualizar oferta (${res.status})`);
  }
}
