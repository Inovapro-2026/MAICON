'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, Bot, User, FlaskConical } from 'lucide-react';
import { DashboardShell } from '@/components/layout/shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useApi, request } from '@/hooks/use-api';

interface PlaygroundStatus {
  available: boolean;
  provider: string | null;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface PlaygroundReply {
  reply: string;
  stage: string;
  intent: string;
  goal: string;
  next_action: string;
  structured: boolean;
  agent: { id: string | null; name: string } | null;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  latency_ms: number;
}

const STAGE_LABELS: Record<string, string> = {
  NEW: 'Novo',
  QUALIFYING: 'Qualificação',
  DISCOVERY: 'Descoberta',
  EVALUATION: 'Avaliação',
  NEGOTIATION: 'Negociação',
  CLOSED_WON: 'Fechada (ganha)',
  CLOSED_LOST: 'Fechada (perdida)',
};

const INTENT_LABELS: Record<string, string> = {
  greeting: 'Cumprimento',
  question: 'Pergunta',
  positive_response: 'Resposta positiva',
  negative_response: 'Resposta negativa',
  objection: 'Objeção',
  info_sharing: 'Compartilhou contexto',
  opt_out: 'Opt-out',
  unknown: 'Indefinida',
};

const GOAL_LABELS: Record<string, string> = {
  start_rapport: 'Quebrar o gelo',
  answer_question: 'Responder pergunta',
  discover_business: 'Descobrir o negócio',
  understand_pain: 'Entender a dor',
  present_solution: 'Apresentar solução',
  handle_objection: 'Tratar objeção',
  qualify_interest: 'Qualificar interesse',
  propose_next_step: 'Propor próximo passo',
  transfer_to_human: 'Transferir para humano',
  close_conversation: 'Encerrar conversa',
};

const NEXT_ACTION_LABELS: Record<string, string> = {
  BUILD_RAPPORT: 'Criar rapport',
  ASK_BUSINESS_TYPE: 'Perguntar tipo de negócio',
  ASK_CURRENT_ACQUISITION: 'Perguntar como capta clientes',
  ASK_CURRENT_PROCESS: 'Perguntar processo atual',
  UNDERSTAND_PAIN: 'Entender a dificuldade',
  ANSWER_QUESTION: 'Responder à pergunta',
  EXPLAIN_RELEVANT_SOLUTION: 'Explicar solução relevante',
  HANDLE_OBJECTION: 'Tratar objeção',
  QUALIFY_INTEREST: 'Qualificar interesse',
  PROPOSE_NEXT_STEP: 'Propor próximo passo',
  TRANSFER_TO_HUMAN: 'Transferir para humano',
  CLOSE_CONVERSATION: 'Encerrar conversa',
};

const WELCOME: ChatMessage = {
  role: 'assistant',
  content:
    'Olá! Sou o agente de IA do SAVYRON. Este é o ambiente de teste — fale comigo como se fosse um cliente real no WhatsApp e veja as mesmas respostas que seus clientes recebem.',
};

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser ? (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
          <Bot className="h-4 w-4" />
        </div>
      ) : null}
      <div
        className={`max-w-[82%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${
          isUser
            ? 'rounded-br-sm bg-emerald-600/90 text-white'
            : 'rounded-bl-sm border border-zinc-200 bg-white text-zinc-900'
        }`}
      >
        {message.content}
      </div>
      {isUser ? (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-zinc-600">
          <User className="h-4 w-4" />
        </div>
      ) : null}
    </div>
  );
}

export default function AIPlaygroundPage() {
  const status = useApi<PlaygroundStatus>(['ai-playground-status'], 'ai/playground/status');
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [stage, setStage] = useState<string | null>(null);
  const [lastReply, setLastReply] = useState<PlaygroundReply | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(nextMessages);
    setInput('');
    setError(null);
    setLoading(true);
    try {
      const res = await request<PlaygroundReply>('ai/playground', {
        method: 'POST',
        body: { messages: nextMessages, stage },
      });
      setStage(res.stage);
      setLastReply(res);
      setMessages((prev) => [...prev, { role: 'assistant', content: res.reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao gerar resposta');
      setMessages(messages);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardShell title="Testar IA">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="heading-strong text-xl">Testar IA</h1>
          <p className="text-sm text-zinc-500">
            Chat isolado com o agente usando o <strong>mesmo Motor Comercial do WhatsApp</strong> —
            a mensagem <strong>não é enviada</strong> para cliente real.
          </p>
        </div>
        {lastReply?.agent ? (
          <div className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600">
            <Bot className="h-3.5 w-3.5 text-emerald-600" />
            {lastReply.agent.name}
          </div>
        ) : null}
      </div>

      {!status.isLoading && !status.data?.available ? (
        <Card className="mb-6 border-amber-500/30 bg-amber-500/5">
          <div className="p-4 text-sm text-amber-600">
            Nenhum provedor de IA configurado (GROQ_API_KEY / OPENROUTER_API_KEY). Configure para testar o agente.
          </div>
        </Card>
      ) : null}

      <Card className="flex min-h-[480px] flex-col overflow-hidden">
        <div ref={scrollRef} className="chat-scroll flex-1 space-y-3 overflow-y-auto bg-zinc-50/60 p-4">
          {messages.map((m, i) => (
            <MessageBubble key={i} message={m} />
          ))}
          {loading ? (
            <div className="flex gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
                <Bot className="h-4 w-4" />
              </div>
              <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm border border-zinc-200 bg-white px-4 py-3 shadow-sm">
                <span className="typing-dot h-2 w-2 rounded-full bg-zinc-400" />
                <span className="typing-dot h-2 w-2 rounded-full bg-zinc-400" />
                <span className="typing-dot h-2 w-2 rounded-full bg-zinc-400" />
              </div>
            </div>
          ) : null}
        </div>

        <div className="border-t border-zinc-200 bg-white p-3">
          {error ? (
            <div className="mb-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-600">{error}</div>
          ) : null}
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={1}
              placeholder="Digite como se fosse um cliente real..."
              className="min-h-[44px] w-full resize-none rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 outline-none focus:border-emerald-500/60"
            />
            <Button onClick={() => void send()} loading={loading} disabled={!input.trim()} className="h-[44px] w-[44px] shrink-0 rounded-full !p-0" aria-label="Enviar mensagem">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      {lastReply ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3 py-1 text-[11px] text-emerald-600">
            <FlaskConical className="h-3.5 w-3.5" />
            Resposta gerada apenas para teste — nada foi enviado a nenhum cliente.
          </span>
          {lastReply.stage ? (
            <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] text-zinc-600">
              Estágio: {STAGE_LABELS[lastReply.stage] ?? lastReply.stage}
            </span>
          ) : null}
          {lastReply.intent ? (
            <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] text-zinc-600">
              Intenção: {INTENT_LABELS[lastReply.intent] ?? lastReply.intent}
            </span>
          ) : null}
          {lastReply.goal ? (
            <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] text-zinc-600">
              Objetivo: {GOAL_LABELS[lastReply.goal] ?? lastReply.goal}
            </span>
          ) : null}
          {lastReply.next_action ? (
            <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] text-emerald-600">
              Próximo passo: {NEXT_ACTION_LABELS[lastReply.next_action] ?? lastReply.next_action}
            </span>
          ) : null}
        </div>
      ) : null}
    </DashboardShell>
  );
}