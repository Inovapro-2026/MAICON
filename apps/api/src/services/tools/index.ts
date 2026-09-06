import { createLogger } from "@prospector/logger";
import { READONLY_MESSAGE } from "../agent-guard";
import { executeMemoryTool, MEMORY_TOOLS } from "./memory";
import { executeCalendarTool, CALENDAR_TOOLS } from "./calendar";
import { executeFinancialTool, FINANCIAL_TOOLS } from "./financial";
import { executeExternalTool, EXTERNAL_TOOLS } from "./external";
import { executeCalculateTool, CALCULATE_TOOLS } from "./calculate";
import { executeProjectionTool, PROJECTION_TOOLS } from "./projections";
import { executeAgendaTool, AGENDA_TOOLS } from "./agenda";
import { executeSavyronTool, SAVYRON_TOOLS } from "./savyron";
import { getCurrentDateTime } from "../current-date";

const logger = createLogger("api.tools");

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolResult {
  result: Record<string, unknown>;
  stateChanged: boolean;
}

/**
 * Ferramentas de LEITURA disponíveis ao AGENTE (JARVIS) — nenhuma escrita.
 * Nota: nomes de ferramentas de escrita (create, update, delete, save,
 * pause, start etc.) NÃO existem neste catálogo e NÃO são executáveis.
 */
const DATETIME_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "get_current_datetime",
      description:
        "Retorna a data/hora atual REAL do sistema em America/Sao_Paulo (fonte oficial). " +
        "Use para responder 'que dia é hoje', 'que horas são', 'que dia da semana é', " +
        "'que mês/ano estamos' e para calcular dias relativos ('amanhã', 'ontem', 'daqui a N dias'). " +
        "Nunca invente data/hora.",
      parameters: { type: "object", properties: {} },
    },
  },
];

export const READONLY_TOOLS: ToolDefinition[] = [
  ...DATETIME_TOOLS,
  ...SAVYRON_TOOLS,
  ...MEMORY_TOOLS,
  ...CALENDAR_TOOLS,
  ...FINANCIAL_TOOLS,
  ...AGENDA_TOOLS,
  ...EXTERNAL_TOOLS,
  ...CALCULATE_TOOLS,
  ...PROJECTION_TOOLS,
];

/** Nomes de todas as ferramentas de leitura (whitelist). */
export const READONLY_TOOL_NAMES: ReadonlySet<string> = new Set(
  READONLY_TOOLS.map((t) => t.function.name),
);

export { READONLY_MESSAGE };

/** Nomes conhecidos de ferramentas de escrita — barrados por contrato. */
const WRITE_TOOL_NAMES = new Set([
  // memória
  "save_memory", "delete_memory",
  // agenda/eventos
  "create_calendar_event", "update_calendar_event", "delete_calendar_event",
  "create_reminder", "update_reminder", "delete_reminder",
  // financeiro
  "create_income", "create_expense", "update_financial_transaction", "delete_financial_transaction",
  "create_reminder_with_expense",
  // campanha (muda estado)
  "pause_campaign", "start_campaign",
]);

export function isWriteToolName(name: string): boolean {
  return WRITE_TOOL_NAMES.has(name) || /^(create|update|delete|save|insert|upsert|pause|start|stop|send|import|remove)_/.test(name);
}

/**
 * Executa uma FERRAMENTA DE LEITURA. Qualquer função fora da whitelist
 * (ou com nome de escrita, inclusive via prompt injection) é bloqueada
 * nesta camada — isso vale para modelagens que o LLM tente forçar,
 * independentemente dos argumentos enviados.
 */
export async function executeReadonlyTool(
  name: string,
  businessId: string,
  userId: string,
  args: Record<string, unknown> = {},
): Promise<ToolResult> {
  if (!READONLY_TOOL_NAMES.has(name) || isWriteToolName(name)) {
    logger.warn("Tentativa de escrita bloqueada pelo whitelist do agente", {
      name,
      business_id: businessId,
    });
    return {
      result: { error: READONLY_MESSAGE },
      stateChanged: false,
    };
  }

  if (name === "get_current_datetime") {
    return { result: getCurrentDateTime() as unknown as Record<string, unknown>, stateChanged: false };
  }

  if (name === "search_web" || name === "get_weather" || name === "get_exchange_rate" || name === "get_news" || name === "get_feriados") {
    return executeExternalTool(name, args);
  }

  if (name === "calculate" || name === "calculate_projection") {
    return executeCalculateTool(name, args);
  }

  if (name === "project_month" || name === "project_expenses" || name === "project_income" || name === "project_sales") {
    return executeProjectionTool(name, businessId, args);
  }

  if (name === "get_dashboard_stats" || name === "get_leads" || name === "get_clients" || name === "get_campaigns" || name === "get_campaign_status" || name === "get_last_messages" || name === "get_company" || name === "get_sales_summary" || name === "get_reports") {
    return executeSavyronTool(name, businessId, userId, args);
  }

  const memoryNames = MEMORY_TOOLS.map((t) => t.function.name);
  if (memoryNames.includes(name)) {
    return executeMemoryTool(name, businessId, userId, args);
  }

  const calendarNames = CALENDAR_TOOLS.map((t) => t.function.name);
  if (calendarNames.includes(name)) {
    return executeCalendarTool(name, businessId, userId, args);
  }

  const financialNames = FINANCIAL_TOOLS.map((t) => t.function.name);
  if (financialNames.includes(name)) {
    return executeFinancialTool(name, businessId, userId, args);
  }

  const agendaNames = AGENDA_TOOLS.map((t) => t.function.name);
  if (agendaNames.includes(name)) {
    return executeAgendaTool(name, businessId, userId, args);
  }

  logger.warn("Ferramenta desconhecida", { name });
  return { result: { error: `Ferramenta desconhecida: ${name}` }, stateChanged: false };
}