/**
 * Progresso da prospecção: descarte de itens sem telefone/e-mail é
 * transparente ("Sem contato"), animação de atividade em "Em andamento" e
 * mensagem final clara quando nada é aproveitável. Inspeção do código real.
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

const tab = read("apps/dashboard/components/prospect/prospect-tab.tsx");
const orchestrator = read("services/prospector/src/orchestrator.ts");
const processor = read("apps/worker/src/jobs/prospect.processor.ts");
const types = read("services/prospector/src/types.ts");

test("UI: contador 'Sem contato' (descartados) aparece no card de progresso", () => {
  assert.match(tab, /label="Sem contato"/);
  assert.match(tab, /discarded_count/);
  assert.match(tab, /grid-cols-2 gap-3 sm:grid-cols-5/);
});

test("UI: badge 'Em andamento' tem animação de atividade (pulse/ping)", () => {
  assert.match(tab, /animate-pulse/);
  assert.match(tab, /animate-ping/);
  assert.match(tab, /Em andamento/);
});

test("UI: mensagem final diferencia 'buscou mas sem contato' de 'nada encontrado'", () => {
  assert.match(tab, /Encontramos/);
  assert.match(tab, /nenhum tinha telefone ou e-mail públicos disponíveis/);
  assert.match(tab, /Tente uma localização mais ampla/);
  assert.match(tab, /descartados/);
});

test("backend: itens sem contato são descartados e contabilizados (discarded)", () => {
  assert.match(types, /discarded: number/);
  assert.match(orchestrator, /progress\.discarded \+= 1/);
  assert.match(orchestrator, /reject\(result, "NO_CONTACT", candidate\.name\)/);
  assert.match(processor, /discarded_count: p\.discarded/);
});

test("backend: NUNCA salva item sem contato (regra de negócio preservada)", () => {
  assert.match(orchestrator, /if \(!phone && !email\)/);
  assert.match(orchestrator, /continue;/);
});
