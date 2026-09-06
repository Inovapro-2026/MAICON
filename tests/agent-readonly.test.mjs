/**
 * MODO SOMENTE LEITURA DO AGENTE (JARVIS) — "Cérebro de consulta".
 *
 * Garante que a aba AGENTE pode apenas CONSULTAR/ANALISAR (DB, Web, cálculos,
 * projeções) e NUNCA escrever. Camadas verificadas:
 *   1. agent-guard: detecta intenção de escrita em linguagem natural ANTES do LLM;
 *   2. catálogo de ferramentas: apenas ferramentas de leitura são oferecidas;
 *   3. whitelist + executeReadonlyTool: bloqueia nomes de escrita na execução;
 *   4. serviço: prompt somente leitura, auditoria de consulta/tentativa.
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

const GUARD = read("apps/api/src/services/agent-guard.ts");
const TOOLS_INDEX = read("apps/api/src/services/tools/index.ts");
const JARVIS = read("apps/api/src/services/jarvis-service.ts");
const AGENT_SERVICE = read("apps/api/src/services/agent-service.ts");
const SAVYRON = read("apps/api/src/services/tools/savyron.ts");
const AGENT_ROUTES = read("apps/api/src/routes/agent.ts");
const AGENT_TAB = read("apps/dashboard/components/agent/agent-tab.tsx");
const MEMORY = read("apps/api/src/services/tools/memory.ts");
const CALENDAR = read("apps/api/src/services/tools/calendar.ts");
const FINANCIAL = read("apps/api/src/services/tools/financial.ts");
const AGENDA = read("apps/api/src/services/tools/agenda.ts");

const READONLY_MESSAGE =
  "Senhor, a aba Agente opera em modo somente leitura. Posso consultar ou analisar seus dados, mas alterações devem ser realizadas pelo módulo correspondente.";

// Guarda comportamental: extrai os padrões e exemplos declarados no source.
const grabArray = (name) => {
  const m = GUARD.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\]);`));
  assert.ok(m, `Array ${name} deve existir em agent-guard.ts`);
  // eslint-disable-next-line no-eval
  return eval(m[1]);
};

function buildDetectWriteIntent() {
  const entryRe = /\{\s*category:\s*"([a-z_]+)",\s*pattern:\s*(\/(?:[^\/\\]|\\.)*\/[a-z]*),\s*\}/gs;
  const patterns = [];
  let m;
  while ((m = entryRe.exec(GUARD)) !== null) {
    // eslint-disable-next-line no-eval
    patterns.push({ category: m[1], pattern: eval(m[2]) });
  }
  assert.ok(patterns.length >= 8, "A guarda deve ter padrões para todas as categorias de escrita");
  return (text) => {
    const lower = text.toLowerCase();
    for (const e of patterns) {
      if (e.pattern.test(lower)) return e.category;
    }
    return null;
  };
}

const detectWriteIntent = buildDetectWriteIntent();

test("readonly: READONLY_MESSAGE exato definido na guarda", () => {
  assert.ok(GUARD.includes(READONLY_MESSAGE), "READONLY_MESSAGE deve ter o texto exato do spec");
});

test("readonly: frases de CONSULTA não são bloqueadas (exemplos do spec)", () => {
  const queries = grabArray("QUERY_EXAMPLES");
  assert.ok(queries.length >= 10);
  for (const q of queries) {
    assert.equal(detectWriteIntent(q), null, `Consulta não deveria ser bloqueada: "${q}"`);
  }
});

test("readonly: frases de ESCRITA são bloqueadas antes do LLM (exemplos do spec)", () => {
  const writes = grabArray("WRITE_BLOCK_EXAMPLES");
  assert.ok(writes.length >= 16);
  for (const w of writes) {
    assert.notEqual(detectWriteIntent(w), null, `Escrita deveria ser bloqueada: "${w}"`);
  }
});

test("readonly: guarda cobre as categorias exigidas pelo spec", () => {
  assert.match(GUARD, /edit_delete/);
  assert.match(GUARD, /create_financial/);
  assert.match(GUARD, /record_financial/);
  assert.match(GUARD, /create_reminder/);
  assert.match(GUARD, /create_event/);
  assert.match(GUARD, /campaign_control/);
  assert.match(GUARD, /create_client/);
  assert.match(GUARD, /update_profile/);
  assert.match(GUARD, /prompt_injection/);
});

test("readonly: catálogo expõe apenas tools de LEITURA (sem names de escrita)", () => {
  const toolFiles = [MEMORY, CALENDAR, FINANCIAL, AGENDA, SAVYRON].join("\n");
  const writeToolNames = [
    "create_calendar_event", "update_calendar_event", "delete_calendar_event",
    "create_reminder", "update_reminder", "delete_reminder",
    "create_income", "create_expense", "update_financial_transaction", "delete_financial_transaction",
    "create_reminder_with_expense",
    "save_memory", "delete_memory",
    "pause_campaign", "start_campaign",
  ];
  for (const name of writeToolNames) {
    // Definição de tool não pode existir em nenhum módulo do agente.
    assert.ok(!new RegExp(`name:\\s*"${name}"`).test(TOOLS_INDEX), `WHITELIST: ${name} não pode estar presente nativamente no agente`);
    assert.ok(!new RegExp(`name:\\s*"${name}"`).test(toolFiles), `TOOLS: ${name} não pode existir como ferramenta do agente`);
    assert.doesNotMatch(TOOLS_INDEX, new RegExp(`case "${name}"`), `EXEC: ${name} não pode ser executável`);
  }
});

test("readonly: whitelist READONLY_TOOL_NAMES contém todas as consultas obrigatórias do spec", () => {
  // Fonte combinada: index (spread) + definições de cada módulo de leitura.
  const readOnlySource = [
    TOOLS_INDEX,
    SAVYRON,
    MEMORY,
    CALENDAR,
    FINANCIAL,
    AGENDA,
    read("apps/api/src/services/tools/external.ts"),
    read("apps/api/src/services/tools/calculate.ts"),
    read("apps/api/src/services/tools/projections.ts"),
  ].join("\n");

  for (const name of [
    // SAVYRON (negócio)
    "get_dashboard_stats", "get_leads", "get_clients", "get_campaigns",
    "get_campaign_status", "get_last_messages", "get_company",
    "get_sales_summary", "get_reports",
    // financeiro (leitura + projeção)
    "get_financial_summary", "list_financial_transactions", "get_financial_projection",
    "project_month", "project_expenses", "project_income", "project_sales",
    // agenda (leitura)
    "list_calendar_events", "list_reminders", "parse_date", "check_event_conflicts", "find_free_slots",
    // memória (leitura)
    "search_memory", "list_recent_memories",
    // externo / cálculo
    "search_web", "get_news", "get_exchange_rate", "get_weather",
    "calculate", "calculate_projection",
  ]) {
    assert.ok(
      readOnlySource.includes(`name: "${name}"`),
      `Ferramenta de leitura obrigatória deve existir: ${name}`,
    );
  }
});

test("readonly: executeReadonlyTool bloqueia nomes de escrita (whitelist na execução)", () => {
  assert.match(TOOLS_INDEX, /READONLY_TOOL_NAMES\.has\(name\)/);
  assert.match(TOOLS_INDEX, /isWriteToolName\(name\)/);
  assert.match(TOOLS_INDEX, /create\|update\|delete\|save\|insert\|upsert\|pause\|start\|stop\|send\|import\|remove\)_/);
  assert.ok(!/isStateChangingTool|ALL_TOOLS\b/.test(TOOLS_INDEX), "Exports antigos de escrita foram removidos");
});

test("readonly: JARVIS não faz escrita direta (sem tryDirectCommand/DB writes/pending)", () => {
  assert.ok(!/(tryDirectCommand|PendingAction\b|setPendingAction|clearPendingAction)/.test(JARVIS), "JARVIS não deve ter comandos diretos de escrita nem fluxo de confirmação");
  assert.ok(!/prisma\.financial(category|transaction)\.(create|update|delete)|prisma\.reminder\.(create|update|delete)|prisma\.calendarEvent\.(create|update|delete)/.test(JARVIS), "JARVIS não deve escrever diretamente no banco");
});

test("readonly: JARVIS blinda com guarda + whitelist + auditoria", () => {
  assert.match(JARVIS, /detectWriteIntent\(transcript\)/);
  assert.match(JARVIS, /agent_write_attempt/);
  assert.match(JARVIS, /agent_query/);
  assert.match(JARVIS, /executeReadonlyTool\(/);
  assert.match(JARVIS, /isWriteToolName\(/);
  assert.match(JARVIS, /READONLY_TOOLS/);
  assert.match(JARVIS, /READONLY_MESSAGE/);
  assert.match(JARVIS, /\$\{READONLY_MESSAGE\}/);
});

test("readonly: prompt do JARVIS é explicitamente somente leitura", () => {
  assert.match(JARVIS, /MODO SOMENTE LEITURA/);
  assert.match(JARVIS, /NUNCA pode criar, editar, excluir/);
  assert.ok((JARVIS.match(/somente leitura/g) || []).length >= 2, "Prompt reforça o modo somente leitura");
  assert.ok(!/(pause_campaign|start_campaign|create_calendar_event|create_income|save_memory)/.test(JARVIS), "Prompt não lista ferramentas de escrita");
});

test("readonly: agent-service não possui mais tools de escrita (pause/start) nem código morto", () => {
  assert.ok(!/pause_campaign|start_campaign/.test(AGENT_SERVICE));
  assert.ok(!/getDashboardMetrics|getCampaignStats/.test(AGENT_SERVICE), "Imports de escrita/controle removidos");
  assert.match(AGENT_SERVICE, /jarvisChat/);
  assert.match(AGENT_SERVICE, /processChat/);
});

test("readonly: routes/agent expõe apenas STT/TTS/chat (sem endpoints de escrita)", () => {
  assert.match(AGENT_ROUTES, /agentRouter\.post\(\s*'\/chat'|processChat/);
  for (const method of ["put", "patch", "delete"]) {
    assert.ok(!new RegExp(`agentRouter\\.${method}`).test(AGENT_ROUTES), `Não pode haver endpoint ${method.toUpperCase()} /agent`);
  }
});

test("readonly: tools SAVYRON são multi-tenant (filtro por business_id)", () => {
  assert.match(SAVYRON, /business_id: businessId/);
  assert.ok(!/\.(create|update|delete|upsert)\(/.test(SAVYRON), "Ferrramentas SAVYRON não escrevem");
  assert.ok(!/stateChanged:\s*true/.test(SAVYRON), "Nenhuma ferramenta SAVYRON muda estado");
});

test("readonly: tools read-only não alteram estado (stateChanged sempre false)", () => {
  const readFiles = [MEMORY, CALENDAR, FINANCIAL, AGENDA].join("\n");
  assert.ok(!/\.(create|update|delete|upsert)\(/.test(readFiles), "Módulos de leitura não executam writes no prisma");
  assert.ok(!/stateChanged:\s*true/.test(readFiles), "Nenhuma ferramenta de leitura reporta mudança de estado");
});

test("readonly: frontend exibe o indicador de modo consulta", () => {
  assert.match(AGENT_TAB, /Modo consulta \(somente leitura\)/);
  assert.match(AGENT_TAB, /JARVIS/);
});

test("readonly: TTS normaliza valores (reais/datas/horas) para voz", () => {
  const tts = read("apps/api/src/services/tts-normalizer.ts");
  assert.match(tts, /normalizeForTTS/);
  assert.match(tts, /currencyToWords/);
  // O prefixo R$ é OBRIGATÓRIO (não mais opcional "R?$?" que convertia
  // qualquer número — dias, anos — em reais).
  assert.ok(tts.includes("R\\$\\s*(\\d"), "Requisito: conversão monetária exige prefixo R$");
  assert.ok(!tts.includes("R?\\$?"), "Sem prefixo opcional R?$? (bug 'dias virando reais')");

  // O normalizador do navegador vive em engine-utils.ts (motor compartilhado V1/V2).
  const tabNormalizer = read("apps/dashboard/components/agent/engine-utils.ts");
  assert.match(tabNormalizer, /normalizeForTTS/);
  assert.ok(tabNormalizer.includes("R\\$\\s*(\\d"), "Requisito: conversão monetária exige prefixo R$");
  assert.ok(!tabNormalizer.includes("R?\\$"), "Sem prefixo opcional R?$ no normalizador do navegador");
});

test("readonly: TTS NÃO converte dias/quantidades em reais (correção 'dias como dinheiro')", async () => {
  const { normalizeForTTS } = await import("../apps/api/src/services/tts-normalizer.ts");

  const agenda = normalizeForTTS("A agenda possui compromissos nos dias 6, 7, 11 e 12 de setembro de 2026.");
  assert.ok(!agenda.includes("reais"), `Dias não podem virar reais: "${agenda}"`);
  assert.ok(agenda.includes("6, 7, 11 e 12") || agenda.includes("6, 7, 11"), `Dias preservados: "${agenda}"`);

  const custo = normalizeForTTS("O custo é de R$ 50 por dia.");
  assert.ok(custo.includes("cinquenta reais"), custo);
  assert.ok(!custo.includes("50"), `Valor com R$ deve virar extenso: "${custo}"`);

  const comCentavos = normalizeForTTS("Faturamento de R$ 1.234,56 no mês.");
  assert.ok(comCentavos.includes("mil") && comCentavos.includes("reais"), comCentavos);

  const dataSolta = normalizeForTTS("Reunião dia 6 de setembro.");
  assert.ok(!dataSolta.includes("reais"), `Data não pode virar reais: "${dataSolta}"`);
});

test("readonly: get_sales_summary calcula períodos (mês atual e retroativos)", () => {
  // get_sales_summary agrega mês atual e meses anteriores para tendência.
  assert.match(SAVYRON, /getMonth\(\) - /);
});