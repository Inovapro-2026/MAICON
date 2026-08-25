'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  LogOut,
  Bell,
  ChevronDown,
  User,
  MessageSquare,
  CheckCheck,
  ArrowRight,
  X,
  Send,
  ExternalLink,
} from 'lucide-react';
import { useSession } from '@/hooks/use-session';
import { useApi, request } from '@/hooks/use-api';
import { useRealtime } from '@/hooks/use-realtime';
import { useQueryClient } from '@tanstack/react-query';
import type { RealtimeEventMessage } from '@/lib/realtime';

interface NotificationItem {
  id: string;
  business_id: string;
  type: string;
  title: string;
  description: string;
  preview: string | null;
  lead_id: string | null;
  conversation_id: string | null;
  message_id: string | null;
  read: boolean;
  read_at: string | null;
  created_at: string;
}

interface NotificationsResponse {
  total: number;
  unreadCount: number;
  notifications: NotificationItem[];
}

interface FloatingNotification {
  id: string;
  title: string;
  description: string;
  preview: string;
  conversationId?: string;
  createdAt: number;
}

function formatRelativeTime(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const s = Math.floor(diff / 1000);
  if (s < 60) return s < 10 ? 'agora' : `há ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

export function Topbar({ title }: { title: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [floatingNotif, setFloatingNotif] = useState<FloatingNotification | null>(null);

  // Busca notificações reais com refetch a cada 15 segundos
  const notifQuery = useApi<NotificationsResponse>(
    ['notifications'],
    'notifications',
    { refetchInterval: 15000 }
  );

  // Auto-dismiss do popout flutuante após 8 segundos
  useEffect(() => {
    if (!floatingNotif) return;
    const timer = setTimeout(() => {
      setFloatingNotif(null);
    }, 8000);
    return () => clearTimeout(timer);
  }, [floatingNotif]);

  // Invalida dados e exibe popout flutuante quando chega nova resposta de WhatsApp
  const handleRealtimeMessage = useCallback(
    (event: RealtimeEventMessage) => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['metrics'] });

      if (event.payload?.direction === 'IN') {
        const notifData = event.payload.notification as
          | { id?: string; title?: string; description?: string; preview?: string }
          | undefined;

        const notifTitle = notifData?.title || 'Nova resposta no WhatsApp';
        const notifDesc = notifData?.description || 'Um contato respondeu sua mensagem.';
        const notifPreview = notifData?.preview || event.payload.content || '';

        setFloatingNotif({
          id: notifData?.id || String(Date.now()),
          title: notifTitle,
          description: notifDesc,
          preview: notifPreview,
          conversationId: event.conversationId,
          createdAt: Date.now(),
        });
      }
    },
    [queryClient]
  );

  useRealtime({
    new_message_received: handleRealtimeMessage,
  });

  const notifications = notifQuery.data?.notifications ?? [];
  const unreadCount = notifQuery.data?.unreadCount ?? 0;

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  const markAllRead = async () => {
    setMarkingAll(true);
    try {
      await request('notifications/mark-all-read', {
        method: 'POST',
        body: {},
      });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    } catch {
      // ignore
    } finally {
      setMarkingAll(false);
    }
  };

  const handleNotificationClick = async (notif: NotificationItem) => {
    setNotifOpen(false);
    if (!notif.read) {
      try {
        await request(`notifications/${notif.id}/read`, {
          method: 'PATCH',
          body: {},
        });
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
      } catch {
        // ignore
      }
    }

    if (notif.conversation_id) {
      router.push(`/inbox/${notif.conversation_id}`);
    } else {
      router.push('/inbox');
    }
  };

  const handleFloatingClick = () => {
    if (floatingNotif?.conversationId) {
      router.push(`/inbox/${floatingNotif.conversationId}`);
    } else {
      router.push('/inbox');
    }
    setFloatingNotif(null);
  };

  const displayName = user?.email ? user.email.split('@')[0] : 'Maicon Silva';
  const formattedName = displayName.charAt(0).toUpperCase() + displayName.slice(1);
  const displayRole =
    user?.platform_role === 'PLATFORM_ADMIN'
      ? 'Administrador'
      : user?.businessRole === 'OWNER'
      ? 'Proprietário'
      : 'Administrador';

  const initials = formattedName.slice(0, 2).toUpperCase();

  return (
    <>
      {/* Popout Flutuante Elegante de Notificação em Tempo Real */}
      {floatingNotif ? (
        <div className="fixed top-5 right-5 z-50 w-full max-w-sm sm:max-w-md animate-in slide-in-from-top-6 fade-in duration-300">
          <div
            onClick={handleFloatingClick}
            className="group relative cursor-pointer overflow-hidden rounded-2xl border border-[#E6E8F0] bg-white/95 p-4 shadow-2xl backdrop-blur-md transition-all hover:border-[#C7D2FE] hover:shadow-indigo-500/10 ring-1 ring-black/5"
          >
            {/* Barra de progresso de auto-dismiss */}
            <div className="absolute top-0 left-0 h-1 w-full bg-slate-100">
              <div className="h-full bg-gradient-to-r from-[#10B981] to-[#6366F1] animate-[progress_8s_linear_forwards]" />
            </div>

            <div className="flex items-start gap-3.5 pt-1">
              {/* Ícone WhatsApp */}
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#ECFDF5] text-[#10B981] shadow-xs">
                <MessageSquare className="h-5 w-5" />
              </div>

              {/* Detalhes da Notificação */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#10B981]">
                    <span className="h-2 w-2 rounded-full bg-[#10B981] animate-ping" />
                    {floatingNotif.title}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFloatingNotif(null);
                    }}
                    className="rounded-lg p-1 text-[#94A3B8] transition-colors hover:bg-slate-100 hover:text-[#0F172A]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-1 text-sm font-bold text-[#0F172A]">
                  {floatingNotif.description}
                </div>

                {floatingNotif.preview ? (
                  <div className="mt-2 line-clamp-2 rounded-xl border border-slate-100 bg-[#F8FAFC] p-2.5 text-xs font-medium text-[#475569]">
                    "{floatingNotif.preview}"
                  </div>
                ) : null}

                <div className="mt-3 flex items-center justify-between pt-1">
                  <span className="text-[11px] font-medium text-[#94A3B8]">Recebido agora</span>
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-[#6366F1] group-hover:translate-x-0.5 transition-transform">
                    Abrir conversa <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-[#E6E8F0] bg-white/95 px-4 backdrop-blur-md lg:px-8">
        {/* Title / Breadcrumb */}
        <div>
          <h1 className="text-lg font-bold text-[#0F172A]">{title}</h1>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-3">
          {/* Notification bell dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setNotifOpen((v) => !v);
                setDropdownOpen(false);
              }}
              className="relative flex h-9 w-9 items-center justify-center rounded-xl text-[#64748B] transition-colors hover:bg-slate-100 hover:text-[#0F172A] focus:outline-none"
              aria-label="Notificações"
              aria-expanded={notifOpen}
            >
              <Bell className="h-4.5 w-4.5" />
              {unreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#EF4444] px-1 text-[10px] font-extrabold text-white ring-2 ring-white shadow-xs animate-in zoom-in-50">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              ) : null}
            </button>

            {notifOpen ? (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setNotifOpen(false)} />
                <div className="absolute right-0 top-12 z-30 w-80 sm:w-96 overflow-hidden rounded-2xl border border-[#E6E8F0] bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-150 ring-1 ring-black/5">
                  {/* Header do Popover */}
                  <div className="flex items-center justify-between border-b border-[#F1F5F9] bg-[#F8FAFC] px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-[#0F172A]">Notificações</span>
                      {unreadCount > 0 ? (
                        <span className="rounded-full bg-[#EEF2FF] px-2 py-0.5 text-[11px] font-bold text-[#6366F1]">
                          {unreadCount} nova{unreadCount === 1 ? '' : 's'}
                        </span>
                      ) : null}
                    </div>
                    {unreadCount > 0 ? (
                      <button
                        type="button"
                        onClick={() => void markAllRead()}
                        disabled={markingAll}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#6366F1] hover:text-[#4F46E5] disabled:opacity-50"
                      >
                        <CheckCheck className="h-3.5 w-3.5" />
                        Marcar todas
                      </button>
                    ) : null}
                  </div>

                  {/* Lista de Notificações */}
                  <div className="max-h-80 overflow-y-auto divide-y divide-[#F1F5F9]">
                    {notifications.length > 0 ? (
                      notifications.map((notif) => (
                        <button
                          key={notif.id}
                          type="button"
                          onClick={() => void handleNotificationClick(notif)}
                          className={`group flex w-full items-start gap-3 p-3.5 text-left transition-colors hover:bg-slate-50 ${
                            !notif.read ? 'bg-[#F0FDF4]/50' : ''
                          }`}
                        >
                          {/* Ícone */}
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[#ECFDF5] text-[#10B981] shadow-xs">
                            <MessageSquare className="h-4 w-4" />
                          </div>

                          {/* Conteúdo */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1">
                              <span className="truncate text-xs font-bold text-[#0F172A]">
                                {notif.title}
                              </span>
                              <span className="shrink-0 text-[10px] font-medium text-[#94A3B8]">
                                {formatRelativeTime(notif.created_at)}
                              </span>
                            </div>
                            <div className="mt-0.5 truncate text-xs font-medium text-[#334155]">
                              {notif.description}
                            </div>
                            {notif.preview ? (
                              <div className="mt-1 line-clamp-2 rounded-lg bg-white/80 border border-slate-100 p-1.5 text-[11px] text-[#64748B] italic">
                                "{notif.preview}"
                              </div>
                            ) : null}
                          </div>

                          {/* Indicador não lida */}
                          {!notif.read ? (
                            <div className="mt-1 flex h-2 w-2 shrink-0 rounded-full bg-[#10B981]" />
                          ) : null}
                        </button>
                      ))
                    ) : (
                      <div className="flex flex-col items-center justify-center py-10 text-center px-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-[#94A3B8] mb-2">
                          <Bell className="h-5 w-5" />
                        </div>
                        <div className="text-xs font-bold text-[#0F172A]">Nenhuma notificação</div>
                        <div className="text-[11px] text-[#64748B] mt-0.5">
                          Novas respostas de WhatsApp aparecerão aqui em tempo real.
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Footer do Popover */}
                  <div className="border-t border-[#F1F5F9] bg-[#F8FAFC] p-2 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        setNotifOpen(false);
                        router.push('/inbox');
                      }}
                      className="inline-flex w-full items-center justify-center gap-1 rounded-xl py-1.5 text-xs font-semibold text-[#475569] hover:bg-white hover:text-[#0F172A] transition-colors"
                    >
                      <span>Ver todas em Mensagens</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </>
            ) : null}
          </div>

          {/* User profile dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setDropdownOpen((v) => !v);
                setNotifOpen(false);
              }}
              className="flex items-center gap-2.5 rounded-xl border border-transparent p-1.5 transition-colors hover:border-[#E6E8F0] hover:bg-slate-50"
              aria-expanded={dropdownOpen}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-tr from-[#6366F1] to-[#8B5CF6] text-xs font-bold text-white shadow-xs">
                {initials}
              </div>
              <div className="hidden text-left sm:block">
                <div className="text-xs font-bold leading-tight text-[#0F172A]">{formattedName}</div>
                <div className="text-[10px] font-medium leading-tight text-[#64748B]">{displayRole}</div>
              </div>
              <ChevronDown className="hidden h-3.5 w-3.5 text-[#94A3B8] sm:block" />
            </button>

            {dropdownOpen ? (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setDropdownOpen(false)} />
                <div className="absolute right-0 top-12 z-30 w-52 overflow-hidden rounded-2xl border border-[#E6E8F0] bg-white p-1.5 shadow-xl">
                  <div className="border-b border-slate-100 px-3 py-2 text-xs">
                    <div className="font-bold text-[#0F172A]">{formattedName}</div>
                    <div className="text-[11px] text-[#64748B] truncate">{user?.email ?? 'admin@savyron.com'}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setDropdownOpen(false);
                      router.push('/settings');
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-[#475569] transition-colors hover:bg-slate-50 hover:text-[#0F172A]"
                  >
                    <User className="h-3.5 w-3.5 text-[#64748B]" />
                    Configurações
                  </button>
                  <button
                    type="button"
                    onClick={() => void logout()}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-[#EF4444] transition-colors hover:bg-red-50"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Sair do sistema
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </header>
    </>
  );
}
