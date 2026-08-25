/**
 * CAMPO "DESCRIÇÃO DA EMPRESA" — expandido para 8.000 caracteres e unificado
 * como campo único de contexto (empresa + regras/comportamento da IA).
 *
 * Garante:
 *  - limite aumentado nas DUAS camadas (frontend maxLength + backend slice);
 *  - UX: textarea maior, contador de caracteres e redimensionamento vertical;
 *  - campo único: "Prompt personalizado" removido do /ai/settings, com o Guia
 *    de prompts acessível perto da descrição;
 *  - o conteúdo expandido realmente chega ao prompt (sem truncamento).
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

const route = read("apps/api/src/routes/business.ts");
const page = read("apps/dashboard/app/(dashboard)/settings/empresa-ia/page.tsx");
const aiSettings = read("apps/dashboard/app/(dashboard)/ai/settings/page.tsx");
const assembler = read("services/ai/src/prompt-assembler.ts");
const turn = read("services/ai/src/commercial-turn.ts");

test("API: descrição aceita até 8.000 caracteres (backend não trunca antes)", () => {
  assert.match(route, /description: body\.description[\s\S]*?slice\(0, 8000\)/);
  assert.match(route, /slice\(0, 8000\)/);
});

test("API: instruções adicionais também aceitam até 8.000 caracteres", () => {
  assert.match(route, /additionalInstructions: body\.instrucoes[\s\S]*?slice\(0, 8000\)/);
});

test("UI: textarea da descrição tem maxLength=8000 (limite na origem)", () => {
  assert.match(page, /maxLength=\{8000\}/);
});

test("UI: contador de caracteres visível (X / 8000) e resize vertical", () => {
  assert.match(page, /\/ 8000/);
  assert.match(page, /resize-y/);
  assert.match(page, /rows=\{8\}/);
});

test("UI: campo é o único de contexto — rótulo deixa claro empresa + comportamento", () => {
  assert.match(
    page,
    /Descrição da empresa\/instrução de comportamento da IA/,
  );
  assert.match(page, /Campo único para dados da empresa \+ regras de comportamento/);
});

test("UI: Guia de prompts acessível perto da descrição", () => {
  assert.match(page, /\/ai\/prompt-guide/);
  assert.match(page, /Guia de prompts/);
});

test("UI: 'Prompt personalizado' removido do /ai/settings (campo único)", () => {
  assert.ok(
    !/Prompt personalizado/.test(aiSettings),
    "não deve existir mais o campo 'Prompt personalizado'",
  );
  assert.ok(!/customPrompt/.test(aiSettings), "não deve haver estado customPrompt");
  assert.ok(
    !/custom_prompt: customPrompt/.test(aiSettings),
    "não deve enviar custom_prompt no corpo da mutation",
  );
});

test("prompt: descrição chega ao modelo em camada 5 (playground + WhatsApp)", () => {
  assert.match(assembler, /Sobre a empresa: \$\{business\.description\.trim\(\)\}/);
  assert.match(turn, /Sobre a empresa: \$\{business\.description\.trim\(\)\}/);
  assert.match(turn, /FATOS OFICIAIS DA EMPRESA/);
});
