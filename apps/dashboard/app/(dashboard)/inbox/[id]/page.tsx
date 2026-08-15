'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AnimatePresence } from 'framer-motion';
import { ArrowLeft, Bot, User, Send } from 'lucide-react';
import { Sidebar } from '@/components/layout/sidebar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useApi, request } from '@/hooks/use-api';
import { useRealtime } from '@/hooks/use-realtime';
import { useQueryClient } from '@tanstack/react-query';
import { MessageBubble, ChatMessage } from '@/components/chat/message-bubble';
import { TypingIndicator } from '@/components/chat/typing-indicator';

interface ConversationDetail {
  id: string;
  lead: { id: string; name: string | null; phone: string | null; email: string | null; business_name: string | null; city: string | null; state: string | null; status: string };
  human_handled: boolean;
  ai_provider: string | null;
  status: string;
  messages: ChatMessage[];
}

export default function ConversationDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { success, error: toastError } = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [showTyping, setShowTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prevLen = useRef(0);

  const conversation = useApi<ConversationDetail>(['conversation', id], `conversations/${id}`, { refetchInterval: 10000 });
  const data = conversation.data;

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['conversation', id] });
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
  }, [queryClient, id]);

  // Atualização em tempo real: invalida quando a conversa recebe evento.
  useRealtime({
    new_message_received: (event) => {
      if (event.conversationId === id || event.leadId === data?.lead.id) invalidate();
    },
    ai_response_generated: (event) => {
      if (event.conversationId === id || event.leadId === data?.lead.id) invalidate();
    },
    status_changed: (event) => {
      if (event.conversationId === id || event.leadId === data?.lead.id) invalidate();
    },
  });

  const lastMessage = data?.messages[data.messages.length - 1] ?? null;

  // Indicador de "digitando…": mostra quando a última mensagem é do lead e a
  // conversa está com a IA. Some quando a IA respondeu ou após 40s (seguro).
  useEffect(() => {
    if (!data) return;
    if (!data.human_handled && lastMessage && lastMessage.direction === 'IN') {
      setShowTyping(true);
      const t = window.setTimeout(() => setShowTyping(false), 40000);
      return () => window.clearTimeout(t);
    }
    setShowTyping(false);
  }, [data?.messages.length, data?.human_handled]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll: rola até a última mensagem ao carregar ou ao chegar nova.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const first = prevLen.current === 0;
    prevLen.current = data?.messages.length ?? 0;
    el.scrollTo({ top: el.scrollHeight, behavior: first ? 'auto' : 'smooth' });
  }, [data?.messages.length]);

  useEffect(() => {
    if (showTyping) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [showTyping]);

  const takeover = async () => {
    try {
      await request(`conversations/${id}/takeover`, { method: 'POST', body: {} });
      success('Conversa assumida — modo manual');
      invalidate();
      window.setTimeout(() => inputRef.current?.focus(), 150);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Falha');
    }
  };

  const release = async () => {
    try {
      await request(`conversations/${id}/release`, { method: 'POST', body: {} });
      success('Conversa devolvida para a IA');
      invalidate();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Falha');
    }
  };

  const close = async () => {
    try {
      await request(`conversations/${id}/close`, { method: 'POST', body: {} });
      success('Conversa encerrada');
      invalidate();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Falha');
    }
  };

  const send = async () => {
    const content = draft.trim();
    if (!content) return;
    setSending(true);
    try {
      await request(`conversations/${id}/message`, { method: 'POST', body: { content } });
      setDraft('');
      if (inputRef.current) inputRef.current.style.height = 'auto';
      invalidate();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Falha no envio');
    } finally {
      setSending(false);
    }
  };

  const autoGrow = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  };

  const humanMode = Boolean(data && data.human_handled && data.status === 'OPEN');

  return (
    <>
      <Sidebar />
      {/* Direita: chat em altura total (a sidebar fixa fica à esquerda no desktop) */}
      <div className="lg:pl-64">
        <div className="flex h-dvh flex-col bg-zinc-50">
          {/* Header fixo */}
          <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur">
            <div className="flex items-center gap-2 px-2 py-2.5 sm:px-3">
              <Link
                href="/inbox"
                aria-label="Voltar às mensagens"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 transition-colors hover:bg-zinc-100 active:scale-95"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>

              {conversation.isLoading ? (
                <div className="flex h-10 items-center">
                  <Spinner />
                </div>
              ) : data ? (
                <>
                  {/* Identidade */}
                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-sm font-bold text-zinc-700">
                      {(data.lead.name?.[0] ?? '?').toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-semibold text-zinc-900">{data.lead.name ?? 'Contato'}</span>
                        <Badge tone={data.human_handled ? 'blue' : 'violet'} className="px-2 py-0.5">
                          {data.human_handled ? <User className="mr-1 inline h-2.5 w-2.5" /> : <Bot className="mr-1 inline h-2.5 w-2.5" />}
                          {data.human_handled ? 'Manual' : `IA (${data.ai_provider ?? '—'})`}
                        </Badge>
                        <Badge tone={data.status === 'OPEN' ? 'emerald' : 'zinc'} className="hidden px-2 py-0.5 sm:inline-flex">
                          {data.status === 'OPEN' ? 'Aberta' : 'Encerrada'}
                        </Badge>
                      </div>
                      <div className="truncate text-xs text-zinc-500">
                        {data.lead.business_name ? `${data.lead.business_name} · ` : ''}
                        {data.lead.phone ?? data.lead.email ?? ''}
                        {data.lead.city ? ` · ${data.lead.city}/${data.lead.state ?? ''}` : ''}
                      </div>
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex shrink-0 items-center gap-1.5">
                    {!data.human_handled ? (
                      <Button size="sm" onClick={() => void takeover()}>
                        <User className="h-4 w-4" /> Assumir
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => void release()}>
                        <Bot className="h-4 w-4" /> IA
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => void close()}>
                      Encerrar
                    </Button>
                  </div>
                </>
              ) : null}
            </div>
          </header>

          {/* Lista de mensagens (scroll própria) */}
          <main className="chat-scroll flex-1 overflow-y-auto" ref={scrollRef} aria-live="polite">
            <div className="mx-auto w-full max-w-3xl space-y-3 px-3 py-4 sm:px-4">
              {conversation.isLoading ? (
                <div className="flex justify-center py-16">
                  <Spinner />
                </div>
              ) : data && data.messages.length === 0 ? (
                <div className="py-16 text-center text-sm text-zinc-500">Nenhuma mensagem ainda.</div>
              ) : (
                data?.messages.map((m) => <MessageBubble key={m.id} message={m} />)
              )}

              <AnimatePresence>{showTyping && !conversation.isLoading && <TypingIndicator />}</AnimatePresence>
            </div>
          </main>

          {/* Composer fixo no rodapé */}
          <footer className="sticky bottom-0 z-10 border-t border-zinc-200 bg-white/95 px-2 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-2 backdrop-blur sm:px-4">
            <div className="mx-auto w-full max-w-3xl">
              {data && !humanMode && (
                <p className="mb-1.5 text-center text-[11px] text-zinc-500">
                  {data.status === 'OPEN' ? 'A IA está de prontidão. Assuma a conversa para responder manualmente.' : 'Conversa encerrada.'}
                </p>
              )}
              <div className="flex items-end gap-2">
                <div className={`flex-1 transition-opacity duration-300 ${humanMode ? 'opacity-100' : 'opacity-50'}`}>
                  <textarea
                    ref={inputRef}
                    value={draft}
                    disabled={!humanMode}
                    onChange={(e) => {
                      setDraft(e.target.value);
                      autoGrow();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void send();
                      }
                    }}
                    placeholder={humanMode ? 'Digite sua resposta manual…' : 'Modo manual: assuma a conversa para responder'}
                    rows={1}
                    className="min-h-[44px] w-full resize-none rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder-zinc-600 focus:border-emerald-500 focus:outline-none disabled:cursor-not-allowed disabled:border-zinc-200 disabled:bg-zinc-50 disabled:text-zinc-500"
                  />
                </div>
                <Button onClick={() => void send()} loading={sending} disabled={!humanMode || !draft.trim()} className="h-[44px] w-[44px] shrink-0 rounded-full !p-0" aria-label="Enviar mensagem">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </>
  );
}