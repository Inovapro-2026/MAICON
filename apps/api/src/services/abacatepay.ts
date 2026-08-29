/**
 * Integração AbacatePay (gateway atual do SAVYRON — PIX manual).
 *
 * PIX manual sem recorrência automática: cada ciclo de 30 dias gera um novo
 * PIX (`POST /transparents/create` com method=PIX); a confirmação chega pelo
 * webhook `transparent.completed` (ou alias `checkout.completed`).
 *
 * Segurança do webhook (duas camadas — use ambas):
 *  - `webhookSecret` na query string (?webhookSecret=...) — única confidencial.
 *  - Header `x-webhook-signature`: HMAC-SHA256 sobre o corpo RAW, digest
 *    base64, usando a CHAVE PÚBLICA da AbacatePay (constante da SDK). A chave
 *    pública NÃO é segredo — por isso a camada do secret é obrigatória.
 *
 * Valores em centavos. Envelope da API: { data, error, success }.
 */
import { config } from "@prospector/config";
import { createLogger } from "@prospector/logger";
import crypto from "node:crypto";

const logger = createLogger("api.abacatepay");

/**
 * Chave pública usada pela AbacatePay para assinar os webhooks (HMAC-SHA256).
 * Constante da SDK (docs.abacatepay.com/pages/webhooks/security) — NÃO é um
 * segredo; a autenticidade de fato vem do `webhookSecret` na query string.
 */
export const ABACATEPAY_PUBLIC_KEY =
  "t9dXRhHHo3yDEj5pVDYz0frf7q6bMKyMRmxxCPIPp3RCplBfXRxqlC6ZpiWmOqj4L63qEaeUOtrCI8P0VMUgo6iIga2ri9ogaHFs0WIIywSMg0q7RmBfybe1E5XJcfC4IW3alNqym0tXoAKkzvfEjZxV6bE0oG2zJrNNYmUCKZyV0KZ3JS8Votf9EAWWYdiDkMkpbMdPggfh1EqHlVkMiTady6jOR3hyzGEHrIz2Ret0xHKMbiqkr9HS1JhNHDX9";

export class AbacatePayNotConfiguredError extends Error {
  constructor() {
    super("AbacatePay não configurado (ABACATEPAY_API_KEY ausente)");
    this.name = "AbacatePayNotConfiguredError";
  }
}

export function isAbacatepayConfigured(): boolean {
  return Boolean(config.abacatepay.apiKey?.trim());
}

export function getAbacatepayBaseUrl(): string {
  return (
    config.abacatepay.apiBaseUrl?.trim() || "https://api.abacatepay.com/v2"
  );
}

async function apiFetch<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  if (!isAbacatepayConfigured()) throw new AbacatePayNotConfiguredError();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.abacatepay.apiKey!.trim()}`,
    "Content-Type": "application/json",
  };
  const res = await fetch(`${getAbacatepayBaseUrl()}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const raw = await res.text();
  const parsed = (() => {
    try {
      return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  })();
  if (!res.ok) {
    const errData = parsed.error as
      { message?: string; code?: string } | undefined;
    logger.error("Falha na chamada AbacatePay", {
      path,
      method: options.method ?? "GET",
      status: res.status,
      code: errData?.code,
      message: errData?.message ?? raw.slice(0, 500),
    });
    throw new Error(`AbacatePay: ${errData?.message ?? `erro ${res.status}`}`);
  }
  return (parsed.data ?? parsed) as T;
}

// ---------------------------------------------------------------------------
// API de cobrança transparente (PIX)
// ---------------------------------------------------------------------------

export interface AbacatepayCustomerInput {
  email: string;
  name?: string | null;
  cellphone?: string | null;
  taxId?: string | null;
  zipCode?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AbacatepayCustomer {
  id: string;
  devMode: boolean;
  name?: string | null;
  email?: string | null;
  taxId?: string | null;
}

export interface AbacatepayPixData {
  id: string;
  amount: number;
  status: string;
  devMode: boolean;
  brCode: string;
  brCodeBase64: string;
  platformFee: number;
  receiptUrl?: string | null;
  expiresAt: string;
  metadata?: Record<string, unknown> | null;
}

export interface AbacatepayPixCreateInput {
  amount: number;
  expiresIn?: number;
  description?: string;
  externalId?: string;
  /** Se informado, TODOS os campos são obrigatórios (name, taxId, email, cellphone). */
  customer?: {
    name: string;
    taxId: string;
    email: string;
    cellphone: string;
  };
  metadata?: Record<string, unknown>;
}

/** Cria cliente AbacatePay (apenas e-mail é obrigatório). Idempotente via taxId. */
export async function createAbacatepayCustomer(
  input: AbacatepayCustomerInput,
): Promise<AbacatepayCustomer> {
  const body: Record<string, unknown> = {
    email: input.email.toLowerCase().trim(),
  };
  if (input.name) body.name = input.name;
  if (input.cellphone) body.cellphone = input.cellphone;
  if (input.taxId) body.taxId = input.taxId;
  if (input.zipCode) body.zipCode = input.zipCode;
  if (input.metadata) body.metadata = input.metadata;
  return apiFetch<AbacatepayCustomer>("/customers/create", {
    method: "POST",
    body,
  });
}

/** Cria cobrança PIX (retorna brCode/brCodeBase64 imediatamente). */
export async function createAbacatepayPix(
  input: AbacatepayPixCreateInput,
): Promise<AbacatepayPixData> {
  return apiFetch<AbacatepayPixData>("/transparents/create", {
    method: "POST",
    body: { method: "PIX", data: input },
  });
}

/** Consulta o status de uma cobrança transparente. */
export async function getAbacatepayTransparentStatus(
  id: string,
): Promise<AbacatepayPixData> {
  return apiFetch<AbacatepayPixData>(`/transparents/${encodeURIComponent(id)}`);
}

// ---------------------------------------------------------------------------
// Webhook de pagamentos (registrado com WEBHOOK:CREATE)
// ---------------------------------------------------------------------------

export interface AbacatepayWebhookInput {
  name: string;
  endpoint: string;
  secret: string;
  events: string[];
}

export interface AbacatepayWebhook {
  id: string;
  name: string;
  endpoint: string;
  events: string[];
  devMode: boolean;
  v2: boolean;
}

/** Cria um webhook de pagamentos na AbacatePay (requer permissão WEBHOOK:CREATE). */
export async function createAbacatepayWebhook(
  input: AbacatepayWebhookInput,
): Promise<AbacatepayWebhook> {
  return apiFetch<AbacatepayWebhook>("/webhooks/create", {
    method: "POST",
    body: input,
  });
}

/**
 * Valida o `webhookSecret` recebido como query param (?webhookSecret=...).
 * Compara de forma timing-safe com o configurado. Tolerante a duas formas:
 * - valor cru (ex.: `d%Fxqm...` se o gateway enviar o secret literal)
 * - valor URL-encoded (ex.: `d%25FxqmhLgCDoHq%25wqC%2B...` quando o `%`/`+`
 *   do próprio secret foram escapados ao montar a URL)
 */
export function isAbacatepayWebhookSecretValid(received: unknown): boolean {
  const expected = config.abacatepay.webhookSecret?.trim();
  if (!expected) return false;
  // A AbacatePay pode anexar o secret automaticamente à URL. Se a URL
  // cadastrada também já contém ?webhookSecret=, o express entrega um array.
  const receivedRaw = Array.isArray(received) ? received[0] : received;
  const receivedStr = typeof receivedRaw === "string" ? receivedRaw : "";
  if (!receivedStr) return false;
  if (safeBufferEqual(receivedStr, expected)) return true;
  const decoded = safeDecodeURIComponent(receivedStr);
  if (decoded !== receivedStr && safeBufferEqual(decoded, expected))
    return true;
  return false;
}

export function isAbacatepayWebhookConfigured(): boolean {
  return Boolean(config.abacatepay.webhookSecret?.trim());
}

/**
 * Valida o header `x-webhook-signature` (HMAC-SHA256 base64) sobre o corpo RAW.
 * IMPORTANTE: usa o body bruto (bytes exatos recebidos) — NUNCA o JSON
 * re-serializado, que mudaria os bytes e quebraria o HMAC.
 */
export function isAbacatepaySignatureValid(
  rawBody: Buffer | Uint8Array | string,
  signatureFromHeader: string,
): boolean {
  const body = Buffer.isBuffer(rawBody)
    ? rawBody
    : typeof rawBody === "string"
      ? Buffer.from(rawBody, "utf8")
      : Buffer.from(rawBody);
  // A assinatura chega em base64 do HMAC-SHA256. Aceita também formato hex
  // por tolerância a variações do gateway (logamos o formato adiante).
  const expectedBase64 = crypto
    .createHmac("sha256", ABACATEPAY_PUBLIC_KEY)
    .update(body)
    .digest("base64");
  if (safeBufferEqual(expectedBase64, signatureFromHeader)) return true;

  const expectedHex = crypto
    .createHmac("sha256", ABACATEPAY_PUBLIC_KEY)
    .update(body)
    .digest("hex");
  if (safeBufferEqual(expectedHex, signatureFromHeader)) return true;

  return false;
}

/** Comparação timing-safe entre duas strings (buffers de mesmo tamanho). */
function safeBufferEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  return aBuf.length === bBuf.length && crypto.timingSafeEqual(aBuf, bBuf);
}

/** Decodifica URL-safe; retorna a string original se não for decodificável. */
function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Valida CPF ou CNPJ (apenas dígitos) com dígitos verificadores. */
export function isValidBrazilianTaxId(value: string | null | undefined): boolean {
  if (!value) return false;
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11) return validCpf(digits);
  if (digits.length === 14) return validCnpj(digits);
  return false;
}

function validCpf(d: string): boolean {
  if (new Set(d).size === 1) return false;
  let sum1 = 0;
  let sum2 = 0;
  for (let i = 0; i < 9; i++) {
    sum1 += (10 - i) * Number(d[i]);
    sum2 += (11 - i) * Number(d[i]);
  }
  const d1 = (sum1 * 10) % 11;
  if ((d1 === 10 ? 0 : d1) !== Number(d[9])) return false;
  sum2 += 2 * Number(d[9]);
  const d2 = (sum2 * 10) % 11;
  return (d2 === 10 ? 0 : d2) === Number(d[10]);
}

function validCnpj(d: string): boolean {
  if (new Set(d).size === 1) return false;
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum1 = 0;
  for (let i = 0; i < 12; i++) sum1 += w1[i] * Number(d[i]);
  const d1 = sum1 % 11 < 2 ? 0 : 11 - (sum1 % 11);
  if (d1 !== Number(d[12])) return false;
  let sum2 = 0;
  for (let i = 0; i < 13; i++) sum2 += w2[i] * Number(d[i]);
  const d2 = sum2 % 11 < 2 ? 0 : 11 - (sum2 % 11);
  return d2 === Number(d[13]);
}

/** Payload v2 do webhook AbacatePay: { id, event, apiVersion, devMode, data }. */
export interface AbacatepayWebhookPayload {
  id?: unknown;
  event?: unknown;
  apiVersion?: unknown;
  devMode?: unknown;
  data?: Record<string, unknown>;
}
