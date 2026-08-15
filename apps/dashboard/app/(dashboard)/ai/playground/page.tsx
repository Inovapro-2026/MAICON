'use client';

import { useState } from 'react';
import { Send, FlaskConical, Bot } from 'lucide-react';
import { DashboardShell } from '@/components/layout/shell';
import { Card, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useApi, request } from '@/hooks/use-api';

interface PlaygroundStatus {
  available: boolean;
  provider: string | null;
}

interface PlaygroundResult {
  message: string;
  response: string;
  agent: { id: string; name: string } | null;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  latency_ms: number;
}

export default function AIPlaygroundPage() {
  const status = useApi<PlaygroundStatus>(['ai-playground-status'], 'ai/playground/status');
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<PlaygroundResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const send = async () => {
    if (!message.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await request<PlaygroundResult>('ai/playground', { method: 'POST', body: { message } });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao gerar resposta');
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardShell title="Testar IA">
      <div className="mb-6">
        <h1 className="heading-strong text-xl">Testar IA</h1>
        <p className="text-sm text-zinc-500">
          Ambiente de teste isolado: a mensagem <strong>não é enviada</strong> para o WhatsApp ou e-mail real.
        </p>
      </div>

      {!status.isLoading && !status.data?.available ? (
        <Card className="mb-6 border-amber-500/30 bg-amber-500/5">
          <div className="p-4 text-sm text-amber-600">
            Nenhum provedor de IA configurado (GROQ_API_KEY / OPENROUTER_API_KEY). Configure para testar o agente.
          </div>
        </Card>
      ) : null}

      <Card className="mb-6">
        <CardHeader title="Envie uma mensagem de teste" />
        <div className="space-y-3 p-5">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            placeholder="Ex.: Oi, gostaria de saber mais sobre os serviços de vocês."
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-emerald-500/60"
          />
          <div className="flex justify-end">
            <Button onClick={() => void send()} loading={loading} disabled={!message.trim()}>
              <Send className="mr-2 h-4 w-4" />
              Gerar resposta
            </Button>
          </div>
        </div>
      </Card>

      {error ? (
        <Card className="mb-6 border-red-500/30 bg-red-500/5">
          <div className="p-4 text-sm text-red-600">{error}</div>
        </Card>
      ) : null}

      {result ? (
        <Card>
          <CardHeader
            title="Resposta da IA"
            action={
              <div className="flex flex-col items-end gap-0.5 text-right">
                {result.agent ? (
                  <span className="flex items-center gap-1 text-[11px] text-zinc-500">
                    <Bot className="h-3 w-3" /> {result.agent.name}
                  </span>
                ) : null}
              </div>
            }
          />
          <div className="space-y-4 p-5">
            <div>
              <div className="mb-1 text-xs font-medium text-zinc-500">Mensagem enviada</div>
              <div className="rounded-xl bg-white px-3 py-2 text-sm text-zinc-700">{result.message}</div>
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-zinc-500">Resposta da IA</div>
              <div className="whitespace-pre-wrap rounded-xl bg-white px-3 py-2 text-sm text-zinc-900">{result.response}</div>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-[11px] text-emerald-600">
              <FlaskConical className="h-3.5 w-3.5" />
              Esta resposta foi gerada apenas para teste e não foi enviada a nenhum cliente.
            </div>
          </div>
        </Card>
      ) : null}
    </DashboardShell>
  );
}