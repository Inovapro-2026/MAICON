import { createLogger } from "@prospector/logger";
import type { ToolDefinition, ToolResult } from "./index";

const logger = createLogger("api.tools.external");

export const EXTERNAL_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "search_web",
      description: "Pesquisa informações atualizadas na web. Use para consultar notícias, preços, concorrentes, tendências, informações atuais sobre empresas, produtos, serviços, segmentos de mercado. Ex.: 'Pesquise concorrentes da minha empresa', 'Quais as tendências do mercado?', 'Quanto custa este produto?', 'Pesquise empresas que oferecem serviços de marketing digital em SP'.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Termo de pesquisa" },
          max_results: { type: "integer", description: "Máximo de resultados (padrão 5, máximo 10)", default: 5 },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Obtém a previsão do tempo atual para uma cidade. Use para responder 'qual a previsão do tempo hoje?', 'vai chover amanhã?', 'como está o tempo agora?'.",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "Nome da cidade (ex.: São Paulo, Rio de Janeiro)" },
          state: { type: "string", description: "Sigla do estado (opcional, ex.: SP, RJ)" },
        },
        required: ["city"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_exchange_rate",
      description: "Obtém a cotação atual de moedas. Use para responder 'qual a cotação do dólar?', 'quanto vale o euro hoje?', 'conversão de moedas'.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Moeda de origem (ex.: USD, EUR, BRL)", default: "USD" },
          to: { type: "string", description: "Moeda de destino (ex.: BRL, USD, EUR)", default: "BRL" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_news",
      description: "Obtém notícias recentes sobre um tópico ou do mercado em geral. Use para 'quais as últimas notícias?', 'o que está acontecendo no mercado?', 'notícias sobre [assunto]'.",
      parameters: {
        type: "object",
        properties: {
          topic: { type: "string", description: "Tópico ou assunto para buscar notícias (opcional, ex.: tecnologia, mercado financeiro, economia)" },
          max_results: { type: "integer", description: "Máximo de resultados (padrão 5, máximo 10)", default: 5 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_feriados",
      description: "Obtém os feriados nacionais e estaduais de um ano. Use para consultar feriados, saber se uma data é feriado.",
      parameters: {
        type: "object",
        properties: {
          year: { type: "integer", description: "Ano (opcional, padrão: ano atual)" },
          state: { type: "string", description: "Sigla do estado para feriados estaduais (opcional, ex.: SP)" },
        },
      },
    },
  },
];

export async function executeExternalTool(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  switch (name) {
    case "search_web": {
      const query = String(args.query ?? "").trim();
      const maxResults = Math.min(Math.max(Number(args.max_results) || 5, 1), 10);

      if (!query) {
        return { result: { error: "Termo de pesquisa é obrigatório" }, stateChanged: false };
      }

      try {
        const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (res.ok) {
          const data = await res.json() as any;
          return {
            result: {
              source: "Wikipedia",
              title: data.title,
              extract: data.extract?.slice(0, 2000) ?? "Sem informações disponíveis",
              url: data.content_urls?.desktop?.page ?? null,
            },
            stateChanged: false,
          };
        }

        const duckUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;
        const duckRes = await fetch(duckUrl, { signal: AbortSignal.timeout(10000) });
        if (duckRes.ok) {
          const duckData = await duckRes.json() as any;
          const results = duckData.RelatedTopics?.slice(0, maxResults).map((r: any) => ({
            text: r.Text ?? r.Result ?? "",
            url: r.FirstURL ?? "",
          })) ?? [];
          return {
            result: {
              source: "DuckDuckGo",
              abstract: duckData.AbstractText ?? "",
              results,
              count: results.length,
            },
            stateChanged: false,
          };
        }

        return { result: { error: "Pesquisa web indisponível no momento", results: [] }, stateChanged: false };
      } catch (error) {
        logger.warn("Falha na pesquisa web", { error: error instanceof Error ? error.message : String(error) });
        return { result: { error: "Pesquisa web indisponível no momento. Tente novamente mais tarde.", results: [] }, stateChanged: false };
      }
    }

    case "get_weather": {
      const city = String(args.city ?? "").trim();
      if (!city) {
        return { result: { error: "Cidade é obrigatória" }, stateChanged: false };
      }

      try {
        const url = `https://wttr.in/${encodeURIComponent(city)}?format=%C+%t+%h+%w&lang=pt`;
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (res.ok) {
          const text = await res.text();
          return {
            result: {
              city,
              weather: text.trim(),
              source: "wttr.in",
            },
            stateChanged: false,
          };
        }
        return { result: { error: "Previsão do tempo indisponível" }, stateChanged: false };
      } catch (error) {
        logger.warn("Falha ao obter previsão do tempo", { error: error instanceof Error ? error.message : String(error) });
        return { result: { error: "Previsão do tempo indisponível no momento" }, stateChanged: false };
      }
    }

    case "get_exchange_rate": {
      const from = String(args.from ?? "USD").toUpperCase().trim();
      const to = String(args.to ?? "BRL").toUpperCase().trim();

      try {
        const url = `https://api.exchangerate-api.com/v4/latest/${from}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (res.ok) {
          const data = await res.json() as any;
          const rate = data.rates?.[to];
          if (rate) {
            return {
              result: {
                from,
                to,
                rate,
                date: data.date,
                source: "ExchangeRate-API",
              },
              stateChanged: false,
            };
          }
        }
        return { result: { error: `Cotação ${from} para ${to} indisponível` }, stateChanged: false };
      } catch (error) {
        logger.warn("Falha ao obter cotação", { error: error instanceof Error ? error.message : String(error) });
        return { result: { error: "Cotação indisponível no momento" }, stateChanged: false };
      }
    }

    case "get_news": {
      const topic = String(args.topic ?? "").trim();
      const maxResults = Math.min(Math.max(Number(args.max_results) || 5, 1), 10);

      try {
        const query = topic ? encodeURIComponent(topic) : "notícias+brasil";
        const url = `https://newsapi.org/v2/everything?q=${query}&language=pt&pageSize=${maxResults}&apiKey=demo`;
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });

        if (res.ok) {
          const data = await res.json() as any;
          if (data.articles?.length > 0) {
            return {
              result: {
                topic: topic || "geral",
                articles: data.articles.slice(0, maxResults).map((a: any) => ({
                  title: a.title,
                  description: a.description,
                  url: a.url,
                  source: a.source?.name,
                  published_at: a.publishedAt,
                })),
                count: Math.min(data.articles.length, maxResults),
                source: "NewsAPI",
              },
              stateChanged: false,
            };
          }
        }

        const gnewsUrl = `https://gnews.io/api/v4/search?q=${query}&lang=pt&max=${maxResults}&token=demo`;
        const gres = await fetch(gnewsUrl, { signal: AbortSignal.timeout(10000) });
        if (gres.ok) {
          const gdata = await gres.json() as any;
          if (gdata.articles?.length > 0) {
            return {
              result: {
                topic: topic || "geral",
                articles: gdata.articles.slice(0, maxResults).map((a: any) => ({
                  title: a.title,
                  description: a.description,
                  url: a.url,
                  source: a.source?.name,
                  published_at: a.publishedAt,
                })),
                count: Math.min(gdata.articles.length, maxResults),
                source: "GNews",
              },
              stateChanged: false,
            };
          }
        }

        return { result: { error: "Notícias indisponíveis no momento", articles: [] }, stateChanged: false };
      } catch (error) {
        logger.warn("Falha ao obter notícias", { error: error instanceof Error ? error.message : String(error) });
        return { result: { error: "Notícias indisponíveis no momento" }, stateChanged: false };
      }
    }

    case "get_feriados": {
      const year = Number(args.year) || new Date().getFullYear();
      const state = args.state ? String(args.state).toUpperCase().trim() : undefined;

      try {
        const url = `https://brasilapi.com.br/api/feriados/v1/${year}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (res.ok) {
          const data = await res.json() as any[];
          return {
            result: {
              year,
              feriados: data.map((f: any) => ({
                date: f.date,
                name: f.name,
                type: f.type ?? "nacional",
              })),
              count: data.length,
              source: "Brasil API",
            },
            stateChanged: false,
          };
        }
        return { result: { error: "Feriados indisponíveis" }, stateChanged: false };
      } catch (error) {
        logger.warn("Falha ao obter feriados", { error: error instanceof Error ? error.message : String(error) });
        return { result: { error: "Feriados indisponíveis no momento" }, stateChanged: false };
      }
    }

    default:
      return { result: { error: `Ferramenta externa desconhecida: ${name}` }, stateChanged: false };
  }
}