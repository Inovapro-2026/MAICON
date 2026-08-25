/**
 * ABERTURA DINÂMICA (sem sequência fixa de onboarding).
 *
 * A SEQUÊNCIA OBRIGATÓRIA DE ABERTURA foi REMOVIDA por completo: ela forçava
 * "apresentação → nome → apresentação da EMPRESA" e fazia a IA repetir a
 * descrição institucional em vez de avançar a conversa conforme a Descrição da
 * empresa. Agora a IA conduz a conversa inteira de forma dinâmica, guiada pela
 * Descrição + Base de conhecimento + memória. A captura de nome/segmento fica
 * no DECISION ENGINE determinístico, que avança o fluxo sem roteiro fixo.
 *
 * Cobre: remoção do módulo/estágios/colunas; captura de nome e segmento no
 * engine; diretriz de geração sem "PASSO" fixo; memória sem onboarding_stage;
 * worker/playground sem wiring; migração derrubando as colunas.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  deterministicCommercialAnalysis,
  buildGeneratorInstruction,
  getRelevantKnowledge,
  buildCommercialReplyMessages,
  buildMemoryFromResult,
} from "@prospector/ai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function read(rel) {
  return readFileSync(path.join(root, rel), "utf8");
}

function history(messages) {
  return messages.map((content) => ({ role: "user", content }));
}

/** Roda o engine determinístico com o histórico dado e memória opcional. */
function engine(msgs, memory = null, leadName = null, contactType = "novo") {
  return deterministicCommercialAnalysis({
    history: history(msgs),
    leadName,
    contactType,
    memory,
  });
}

// ---------------------------------------------------------------------------
// 1. Módulo de onboarding REMOVIDO (causa raiz do bug de repetição)
// ---------------------------------------------------------------------------

test("onboarding: módulo da sequência obrigatória foi removido", () => {
  const index = read("services/ai/src/index.ts");
  assert.ok(!/onboarding/.test(index), "index.ts não deve exportar onboarding");
  assert.ok(!require_exists("services/ai/src/onboarding.ts"), "arquivo deve ter sido deletado");
});

function require_exists(rel) {
  try {
    read(rel);
    return true;
  } catch {
    return false;
  }
}

test("onboarding: engine não tem mais estágio/diretiva de sequência fixa", () => {
  const engineSrc = read("services/ai/src/commercial-engine.ts");
  assert.ok(!/OnboardingStage|ONBOARDING_STAGES|buildOnboardingDirective|onboarding_stage|onboarding_directive/.test(engineSrc));
  const turn = read("services/ai/src/commercial-turn.ts");
  assert.ok(!/onboarding|Onboarding/.test(turn), "commercial-turn não deve referenciar onboarding");
});

// ---------------------------------------------------------------------------
// 2. Abordagem dinâmica: saudação leve + pergunta do nome (uma vez, natural)
// ---------------------------------------------------------------------------

test("abertura: 'Oi' → saudação natural com pergunta de nome (BUILD_RAPPORT)", () => {
  const d = engine(["Oi"]);
  assert.equal(d.next_action, "BUILD_RAPPORT");
  assert.equal(d.goal, "start_rapport");
  assert.equal(d.customer.name, null);
  assert.equal(d.stage, "NEW");
});

test("abertura: diretriz de geração do BUILD_RAPPORT é leve e pergunta o nome", () => {
  const d = engine(["Oi"]);
  const directive = buildGeneratorInstruction(d);
  assert.match(directive, /pergunte o nome do cliente/i);
  assert.ok(!/PASSO/.test(directive), "sem roteiro fixo de passos");
});

// ---------------------------------------------------------------------------
// 3. Captura de nome no DECISION ENGINE (resposta à pergunta do nome)
// ---------------------------------------------------------------------------

test("captura de nome: 'Maicon Silva' após perguntar o nome → ASK_BUSINESS_TYPE", () => {
  const d = engine(
    ["Oi", "Maicon Silva"],
    { next_action: "BUILD_RAPPORT", last_question: "Qual é o seu nome?", known: null, sales_stage: "NEW" },
  );
  assert.equal(d.next_action, "ASK_BUSINESS_TYPE");
  assert.equal(d.customer.name, "Maicon Silva");
  assert.equal(d.known.name.value, "Maicon Silva");
  assert.equal(d.goal, "discover_business");
});

test("captura de nome: nome informado na PRIMEIRA mensagem é capturado", () => {
  const d = engine(
    ["Meu nome é Maicon Silva"],
    null,
  );
  assert.equal(d.customer.name, "Maicon");
  assert.equal(d.next_action, "BUILD_RAPPORT", "primeiro contato: saudação + pergunta de nome no mesmo turno");
});

test("captura de nome: 'quero saber mais' NUNCA vira nome (interesse avança a descoberta)", () => {
  const d = engine(
    ["Oi", "quero saber mais"],
    { next_action: "BUILD_RAPPORT", last_question: "Qual é o seu nome?", known: null, sales_stage: "NEW" },
  );
  assert.equal(d.customer.name, null, "interesse não é nome");
  assert.equal(d.next_action, "ASK_NAME", "interesse positivo avança para descoberta (nome primeiro)");
});

test("captura de nome: saudação 'boa tarde' NÃO vira nome", () => {
  const d = engine(
    ["Oi", "Qual é o seu nome?", "Boa tarde!"],
    { next_action: "ASK_NAME", last_question: "Qual é o seu nome?", known: null, sales_stage: "NEW" },
  );
  assert.equal(d.customer.name, null);
});

test("captura de nome: tipo de negócio como resposta avança para DISCOVERY (segmento)", () => {
  const d = engine(
    ["Oi", "tenho uma loja de roupas"],
    { next_action: "BUILD_RAPPORT", last_question: "Qual é o seu nome?", known: null, sales_stage: "NEW" },
  );
  assert.equal(d.known.segment.value, "Loja");
  assert.equal(d.next_action, "ASK_CURRENT_ACQUISITION");
  assert.equal(d.customer.name, null, "segmento não vira nome");
});

// ---------------------------------------------------------------------------
// 4. Descoberta dinâmica: segmento → canal de aquisição (sem roteiro fixo)
// ---------------------------------------------------------------------------

test("descoberta: 'tenho uma barbearia' → pergunta como capta clientes hoje", () => {
  const d = engine(
    ["Oi", "Maicon Silva", "tenho uma barbearia"],
    { next_action: "ASK_BUSINESS_TYPE", last_question: "Qual é o tipo de negócio de vocês?", known: { name: { value: "Maicon Silva", source: "customer", confidence: 1 } }, sales_stage: "DISCOVERY" },
  );
  assert.equal(d.known.segment.value, "Barbearia");
  assert.equal(d.next_action, "ASK_CURRENT_ACQUISITION");
  assert.equal(d.customer.name, "Maicon Silva", "nome já capturado é preservado");
});

test("descoberta: 'redes sociais e indicação' → registra canal e entende dor", () => {
  const d = engine(
    ["Oi", "Meu nome é Maicon", "tenho uma loja", "redes sociais e indicação"],
    { next_action: "ASK_CURRENT_ACQUISITION", last_question: "Como vocês conseguem novos clientes hoje?", known: { name: { value: "Maicon", source: "customer", confidence: 1 }, segment: { value: "Loja", source: "customer", confidence: 1 } }, sales_stage: "DISCOVERY" },
  );
  assert.equal(d.known.acquisition_channel.value, "Redes sociais");
  assert.equal(d.next_action, "UNDERSTAND_PAIN");
});

// ---------------------------------------------------------------------------
// 5. Diretriz de geração: usa o próximo passo do engine, SEM roteiro fixo
// ---------------------------------------------------------------------------

test("geração: ASK_BUSINESS_TYPE → pergunta natural o tipo de negócio (sem PASSO)", () => {
  const d = engine(
    ["Oi", "Maicon Silva"],
    { next_action: "BUILD_RAPPORT", last_question: "Qual é o seu nome?", known: null, sales_stage: "NEW" },
  );
  const directive = buildGeneratorInstruction(d);
  assert.match(directive, /tipo de negócio/i);
  assert.match(directive, /Maicon Silva/, "usa o nome capturado naturalmente");
  assert.ok(!/PASSO/.test(directive));
  assert.ok(!/onboarding|AWAITING_NAME|COMPANY_PRESENTED/.test(directive), "sem jargão interno");
});

test("geração: sem diretiva de onboarding em nenhum next_action", () => {
  for (const na of ["BUILD_RAPPORT", "ASK_NAME", "ASK_BUSINESS_TYPE", "EXPLAIN_RELEVANT_SOLUTION"]) {
    const directive = buildGeneratorInstruction({
      intent: "info_sharing",
      stage: "DISCOVERY",
      known: { name: null, segment: null, need: null, acquisition_channel: null },
      goal: "discover_business",
      next_action: na,
      customer: { name: null, segment: null, interest: null },
      technique_used: "calibrated_questions",
      action: "CONTINUE_CONVERSATION",
      summary: "",
    });
    assert.ok(!/PASSO|apresente a EMPRESA/.test(directive), `${na} não deve usar diretiva fixa`);
  }
});

// ---------------------------------------------------------------------------
// 6. Memória persistida: sem onboarding_stage
// ---------------------------------------------------------------------------

test("memória: buildMemoryFromResult NÃO grava onboarding_stage", () => {
  const memory = buildMemoryFromResult({
    summary: "Cliente se chama João.",
    goal: "discover_business",
    next_action: "ASK_BUSINESS_TYPE",
    known: {
      name: { value: "João", source: "customer", confidence: 1 },
      segment: null,
      need: null,
      acquisition_channel: null,
    },
    conversation: { stage: "DISCOVERY" },
  });
  assert.equal(memory.sales_stage, "DISCOVERY");
  assert.equal(memory.last_question, "Qual é o tipo de negócio de vocês?");
  assert.ok(!("onboarding_stage" in memory), "não deve conter onboarding_stage");
});

test("memória: next_action ASK_NAME marca a pergunta do nome em last_question", () => {
  const memory = buildMemoryFromResult({
    summary: "",
    goal: "start_rapport",
    next_action: "ASK_NAME",
    known: { name: null, segment: null, need: null, acquisition_channel: null },
    conversation: { stage: "NEW" },
  });
  assert.equal(memory.last_question, "Qual é o seu nome?");
});

// ---------------------------------------------------------------------------
// 7. Base de conhecimento (relevância, sem gate de sequência)
// ---------------------------------------------------------------------------

test("conhecimento: base relevante à mensagem é selecionada", () => {
  const items = [
    { title: "Planos", content: "O plano profissional custa 39,90 por mês." },
    { title: "Horários", content: "Atendemos de segunda a sexta, das 9h às 18h." },
  ];
  const relevant = getRelevantKnowledge("quanto custa o plano profissional?", items);
  assert.deepEqual(relevant.map((k) => k.title), ["Planos"]);
});

test("conhecimento: itens irrelevantes não entram na resposta", () => {
  const items = [
    { title: "Planos", content: "O plano profissional custa 39,90 por mês." },
    { title: "Horários", content: "Atendemos de segunda a sexta, das 9h às 18h." },
  ];
  const relevant = getRelevantKnowledge("qual o horário de atendimento?", items);
  assert.deepEqual(relevant.map((k) => k.title), ["Horários"]);
});

test("conhecimento: entra no prompt do gerador sem vazar regras internas", () => {
  const messages = buildCommercialReplyMessages(
    { agent: { name: "Ana" }, business: { name: "SAVYRON" } },
    { leadName: "João", history: [{ role: "user", content: "quanto custa?" }] },
    {
      intent: "question",
      stage: "EVALUATION",
      known: { name: { value: "João", source: "customer", confidence: 1 }, segment: null, need: null, acquisition_channel: null },
      goal: "answer_question",
      next_action: "ANSWER_QUESTION",
      customer: { name: "João", segment: null, interest: null },
      technique_used: "understanding_confirmation",
      action: "CONTINUE_CONVERSATION",
      summary: "Cliente pergunta preço.",
    },
    [{ title: "Planos", content: "O plano profissional custa 39,90." }],
  );
  const full = messages.map((m) => m.content).join("\n");
  assert.match(full, /Planos/);
  assert.match(full, /39,90/);
  for (const term of ["REGRAS GLOBAIS DO SAVYRON", "technique_used", "MOTOR COMERCIAL GLOBAL", "onboarding_stage"]) {
    assert.ok(!full.includes(term), `não deve vazar: ${term}`);
  }
});

// ---------------------------------------------------------------------------
// 8. Integração real (worker / playground / seed / config loader)
// ---------------------------------------------------------------------------

test("worker: usa generateCommercialTurn SEM onboarding (contexto real chega ao modelo)", () => {
  const processor = read("apps/worker/src/jobs/ai-response.processor.ts");
  assert.match(processor, /generateCommercialTurn\(context, \{\s*agentConfig,\s*memory,/);
  assert.ok(!/onboarding: onboardingConfig/.test(processor), "não deve passar onboarding");
  assert.ok(!/onboardingStage: conversation\.onboarding_stage/.test(processor), "não deve ler onboarding_stage");
  assert.ok(!/onboarding_stage: result\.onboardingStage/.test(processor), "não deve persistir onboarding_stage");
  assert.match(processor, /result\.customer\.name/, "nome continua sendo persistido no lead");
});

test("worker: segue enviando followUp quando o motor gerar 2ª mensagem", () => {
  const processor = read("apps/worker/src/jobs/ai-response.processor.ts");
  assert.match(processor, /result\.followUp \?\? replyParts\[1\]/);
});

test("playground: usa o MESMO caminho do WhatsApp (Motor Comercial, sem sequência)", () => {
  const route = read("apps/api/src/routes/ai.ts");
  assert.match(route, /generateCommercialTurn/);
  assert.ok(!/onboarding: onboardingConfig/.test(route), "não deve passar onboarding");
  assert.ok(!/onboarding_stage: result\.onboardingStage/.test(route), "não deve devolver onboarding_stage");
  assert.match(route, /knowledge_used: result\.knowledge_used/);
});

test("dashboard: playground sem rótulos/estado de onboarding", () => {
  const page = read("apps/dashboard/app/(dashboard)/ai/playground/page.tsx");
  assert.ok(!/onboarding_stage/.test(page), "não deve ler onboarding_stage");
  assert.ok(!/ONBOARDING_LABELS|AWAITING_NAME|COMPANY_PRESENTED/.test(page), "sem labels da sequência");
});

test("migração: derruba as colunas da sequência obrigatória", () => {
  const migration = read(
    "packages/database/prisma/migrations/20260821000000_remove_onboarding_sequence/migration.sql",
  );
  assert.match(migration, /"Conversation" DROP COLUMN "onboarding_stage"/);
  assert.match(migration, /"ConversationMemory" DROP COLUMN "onboarding_stage"/);
  assert.match(migration, /"AISettings" DROP COLUMN "onboarding_config"/);
});

test("schema: prisma sem os campos de onboarding", () => {
  const schema = read("packages/database/prisma/schema.prisma");
  assert.ok(!/onboarding_stage/.test(schema), "schema não deve ter onboarding_stage");
  assert.ok(!/onboarding_config/.test(schema), "schema não deve ter onboarding_config");
});

test("seed: NÃO habilita sequência obrigatória no tenant", () => {
  const seed = read("packages/database/src/seed.ts");
  assert.ok(!/onboarding_config/.test(seed), "seed não deve setar onboarding_config");
});

test("config loader: SEM força de sequência por tenant (slug SAVYRON removido)", () => {
  const loader = read("services/ai/src/agent-config.ts");
  assert.ok(!/SAVYRON_TENANT_SLUG/.test(loader), "não deve forçar sequência por slug");
  assert.ok(!/normalizeOnboardingConfig/.test(loader), "sem normalize de onboarding");
});
