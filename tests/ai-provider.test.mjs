/**
 * PROVEDORES DE IA — OpenAI é o primário; Groq fica como fallback.
 *
 * Verifica que: o provider-manager instancia OpenAI primeiro e Groq como
 * fallback, a análise e a geração pedem "openai", a config expõe a chave/modelo
 * OpenAI, e o .env.example documenta as variáveis.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function read(rel) {
  return readFileSync(path.join(root, rel), "utf8");
}

const manager = read("services/ai/src/provider-manager.ts");
const turn = read("services/ai/src/commercial-turn.ts");
const agent = read("services/ai/src/agent.ts");
const config = read("packages/config/src/index.ts");
const envExample = read(".env.example");

test("provider-manager: OpenAI é instanciado como PRIMÁRIO e Groq como fallback", () => {
  assert.match(manager, /new OpenAIProvider\(\), new GroqProvider\(\)/);
  assert.match(manager, /OpenAI \(prim[áa]rio\)/);
});

test("provider-manager: getPrimary retorna o primeiro configurado (openai)", () => {
  assert.match(manager, /getPrimary/);
  assert.match(manager, /ordered\.find\(\(p\) => p\.isConfigured\(\)\)/);
});

test("análise e geração usam o provedor primário (openai)", () => {
  assert.match(turn, /provider: "openai"/);
  assert.match(agent, /provider: ['"]openai['"]/);
});

test("classificadores auxiliares também usam openai (primário)", () => {
  const classifier = read("services/ai/src/classifier.ts");
  const nameValidation = read("services/ai/src/name-validation.ts");
  const structuredConfig = read("services/ai/src/structured-config.ts");
  assert.match(classifier, /provider: ['"]openai['"]/);
  assert.match(nameValidation, /provider: ['"]openai['"]/);
  assert.match(structuredConfig, /provider: ['"]openai['"]/);
});

test("config: expõe chave e modelo da OpenAI (com fallback Groq)", () => {
  assert.match(config, /openaiApiKey: optional\("OPENAI_API_KEY"\)/);
  assert.match(config, /openaiModel: optional\("OPENAI_MODEL", "gpt-4o-mini"\)/);
  assert.match(config, /groqModel: optional\("GROQ_MODEL", "llama-3.1-8b-instant"\)/);
});

test("env example: documenta OPENAI_API_KEY/OPENAI_MODEL como primário", () => {
  assert.match(envExample, /OPENAI_API_KEY=""/);
  assert.match(envExample, /OPENAI_MODEL="gpt-4o-mini"/);
  assert.match(envExample, /OpenAI principal, Groq fallback/);
});

test("tipos: ProviderName aceita openai e groq", () => {
  const types = read("services/ai/src/types.ts");
  assert.match(types, /ProviderName = "openai" \| "groq"/);
});
