import { createLogger } from "@prospector/logger";
import type { ToolDefinition, ToolResult } from "./index";

const logger = createLogger("api.tools.calculate");

export const CALCULATE_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "calculate",
      description: "Realiza cálculos matemáticos confiáveis: soma, subtração, multiplicação, divisão, percentual, média, variação percentual, margem, ROI. Use para cálculos precisos que exigem confiabilidade. Ex.: 'quanto é 15% de 2000?', 'qual a média de 100, 200 e 300?', 'qual a variação percentual de 50 para 75?'.",
      parameters: {
        type: "object",
        properties: {
          operation: { type: "string", enum: ["sum", "subtract", "multiply", "divide", "percentage", "average", "variation", "margin", "roi"], description: "Tipo de operação" },
          values: { type: "array", items: { type: "number" }, description: "Lista de valores para a operação" },
          percentage: { type: "number", description: "Percentual (para operação 'percentage')" },
          total: { type: "number", description: "Valor total (para operação 'percentage')" },
          cost: { type: "number", description: "Custo (para operação 'margin' e 'roi')" },
          revenue: { type: "number", description: "Receita (para operação 'margin' e 'roi')" },
          old_value: { type: "number", description: "Valor antigo (para operação 'variation')" },
          new_value: { type: "number", description: "Valor novo (para operação 'variation')" },
        },
        required: ["operation"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate_projection",
      description: "Calcula uma projeção simples baseada em valores históricos e crescimento. Use para projetar valores futuros.",
      parameters: {
        type: "object",
        properties: {
          current_value: { type: "number", description: "Valor atual/mês atual" },
          growth_rate_percent: { type: "number", description: "Taxa de crescimento mensal em percentual (ex.: 10 para 10%)" },
          months: { type: "integer", description: "Número de meses para projetar", default: 1 },
        },
        required: ["current_value", "growth_rate_percent"],
      },
    },
  },
];

export async function executeCalculateTool(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  switch (name) {
    case "calculate": {
      const operation = String(args.operation ?? "").trim();

      switch (operation) {
        case "sum": {
          const values = (args.values as number[]) ?? [];
          if (values.length === 0) return { result: { error: "Lista de valores vazia" }, stateChanged: false };
          const result = values.reduce((a, b) => a + b, 0);
          return { result: { operation: "soma", values, result, formatted: formatResult(result) }, stateChanged: false };
        }

        case "subtract": {
          const values = (args.values as number[]) ?? [];
          if (values.length < 2) return { result: { error: "São necessários pelo menos 2 valores" }, stateChanged: false };
          const result = values.reduce((a, b) => a - b);
          return { result: { operation: "subtração", values, result, formatted: formatResult(result) }, stateChanged: false };
        }

        case "multiply": {
          const values = (args.values as number[]) ?? [];
          if (values.length < 2) return { result: { error: "São necessários pelo menos 2 valores" }, stateChanged: false };
          const result = values.reduce((a, b) => a * b, 1);
          return { result: { operation: "multiplicação", values, result, formatted: formatResult(result) }, stateChanged: false };
        }

        case "divide": {
          const values = (args.values as number[]) ?? [];
          if (values.length < 2) return { result: { error: "São necessários pelo menos 2 valores" }, stateChanged: false };
          if (values.slice(1).some(v => v === 0)) return { result: { error: "Divisão por zero" }, stateChanged: false };
          const result = values.reduce((a, b) => a / b);
          return { result: { operation: "divisão", values, result, formatted: formatResult(result) }, stateChanged: false };
        }

        case "percentage": {
          const percentage = Number(args.percentage) || 0;
          const total = Number(args.total) || 0;
          const result = (percentage / 100) * total;
          return { result: { operation: "percentual", percentage, total, result, formatted: formatResult(result) }, stateChanged: false };
        }

        case "average": {
          const values = (args.values as number[]) ?? [];
          if (values.length === 0) return { result: { error: "Lista de valores vazia" }, stateChanged: false };
          const result = values.reduce((a, b) => a + b, 0) / values.length;
          return { result: { operation: "média", values, result, formatted: formatResult(result) }, stateChanged: false };
        }

        case "variation": {
          const oldValue = Number(args.old_value) || 0;
          const newValue = Number(args.new_value) || 0;
          if (oldValue === 0) return { result: { error: "Valor antigo não pode ser zero" }, stateChanged: false };
          const variation = ((newValue - oldValue) / oldValue) * 100;
          return {
            result: {
              operation: "variação percentual",
              old_value: oldValue,
              new_value: newValue,
              variation_percent: Math.round(variation * 100) / 100,
              direction: variation > 0 ? "aumento" : variation < 0 ? "redução" : "estável",
              formatted: `${variation > 0 ? "+" : ""}${Math.round(variation * 100) / 100}%`,
            },
            stateChanged: false,
          };
        }

        case "margin": {
          const revenue = Number(args.revenue) || 0;
          const cost = Number(args.cost) || 0;
          if (revenue === 0) return { result: { error: "Receita não pode ser zero" }, stateChanged: false };
          const profit = revenue - cost;
          const margin = (profit / revenue) * 100;
          return {
            result: {
              operation: "margem",
              revenue,
              cost,
              profit,
              margin_percent: Math.round(margin * 100) / 100,
              formatted: `${Math.round(margin * 100) / 100}%`,
            },
            stateChanged: false,
          };
        }

        case "roi": {
          const revenueROI = Number(args.revenue) || 0;
          const costROI = Number(args.cost) || 0;
          if (costROI === 0) return { result: { error: "Custo não pode ser zero" }, stateChanged: false };
          const roi = ((revenueROI - costROI) / costROI) * 100;
          return {
            result: {
              operation: "ROI",
              revenue: revenueROI,
              cost: costROI,
              profit: revenueROI - costROI,
              roi_percent: Math.round(roi * 100) / 100,
              formatted: `${Math.round(roi * 100) / 100}%`,
            },
            stateChanged: false,
          };
        }

        default:
          return { result: { error: `Operação desconhecida: ${operation}` }, stateChanged: false };
      }
    }

    case "calculate_projection": {
      const currentValue = Number(args.current_value) || 0;
      const growthRate = Number(args.growth_rate_percent) || 0;
      const months = Math.max(Number(args.months) || 1, 1);

      if (currentValue <= 0) {
        return { result: { error: "Valor atual deve ser positivo" }, stateChanged: false };
      }

      const rate = growthRate / 100;
      const projectedValue = currentValue * Math.pow(1 + rate, months);
      const series = [];
      for (let i = 1; i <= months; i++) {
        series.push({
          month: i,
          value: Math.round(currentValue * Math.pow(1 + rate, i) * 100) / 100,
        });
      }

      return {
        result: {
          operation: "projeção",
          current_value: currentValue,
          growth_rate_percent: growthRate,
          months,
          projected_value: Math.round(projectedValue * 100) / 100,
          total_growth_percent: Math.round((Math.pow(1 + rate, months) - 1) * 100 * 100) / 100,
          series,
          note: "Projeção linear baseada em taxa de crescimento constante. Valores reais podem variar.",
        },
        stateChanged: false,
      };
    }

    default:
      return { result: { error: `Ferramenta de cálculo desconhecida: ${name}` }, stateChanged: false };
  }
}

function formatResult(value: number): string {
  if (Number.isInteger(value)) return value.toString();
  if (Math.abs(value) >= 1000) return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return Math.round(value * 100) / 100 + "";
}