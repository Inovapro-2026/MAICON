"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AudioLines, Bell, ChevronDown, User, LogOut } from "lucide-react";
import { useSession } from "@/hooks/use-session";
import { useApi } from "@/hooks/use-api";

interface NotificationsResponse {
  total: number;
  unreadCount: number;
}

export function AgentHeader() {
  const router = useRouter();
  const { user } = useSession();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const notifQuery = useApi<NotificationsResponse>(
    ["notifications"],
    "notifications",
    { refetchInterval: 30000 },
  );
  const unreadCount = notifQuery.data?.unreadCount ?? 0;

  const displayName = user?.email ? user.email.split("@")[0] : "Maicon Silva";
  const formattedName =
    displayName.charAt(0).toUpperCase() + displayName.slice(1);
  const displayRole =
    user?.platform_role === "PLATFORM_ADMIN"
      ? "Administrador"
      : user?.businessRole === "OWNER"
        ? "Proprietário"
        : "Administrador";

  const initials = formattedName.slice(0, 2).toUpperCase();

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="relative z-20 flex h-16 w-full items-center justify-between border-b border-white/5 bg-transparent px-4 sm:px-8">
      {/* Título e Subtítulo com Ícone Neon */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-[#6366F1]/30 to-[#8B5CF6]/30 border border-[#818CF8]/40 shadow-[0_0_15px_rgba(99,102,241,0.4)]">
          <AudioLines className="h-5 w-5 text-[#38BDF8]" />
        </div>
        <div>
          <h1 className="text-base sm:text-lg font-bold text-white leading-tight tracking-wide">
            Agente de Voz
          </h1>
          <p className="hidden sm:block text-xs text-[#94A3B8]">
            Converse à vontade com o seu agente
          </p>
        </div>
      </div>

      {/* Controles da Direita (Notificação + Perfil) */}
      <div className="flex items-center gap-3">
        {/* Notificações */}
        <button
          type="button"
          onClick={() => router.push("/inbox")}
          aria-label="Abrir notificações"
          className="relative flex h-9 w-9 items-center justify-center rounded-xl text-[#94A3B8] transition-colors hover:bg-white/10 hover:text-white"
        >
          <Bell className="h-4.5 w-4.5" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#EF4444] px-1 text-[9px] font-extrabold text-white shadow-xs">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>

        {/* Perfil do Usuário */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setDropdownOpen((v) => !v)}
            className="flex items-center gap-2.5 rounded-xl border border-transparent p-1.5 transition-colors hover:border-white/10 hover:bg-white/5"
            aria-expanded={dropdownOpen}
          >
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-gradient-to-tr from-[#6366F1] to-[#8B5CF6] text-xs font-bold text-white shadow-[0_0_12px_rgba(99,102,241,0.5)]">
              {initials}
            </div>
            <div className="hidden text-left sm:block">
              <div className="text-xs font-bold leading-tight text-white">
                {formattedName}
              </div>
              <div className="text-[10px] font-medium leading-tight text-[#94A3B8]">
                {displayRole}
              </div>
            </div>
            <ChevronDown className="hidden h-3.5 w-3.5 text-[#94A3B8] sm:block" />
          </button>

          {dropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setDropdownOpen(false)}
              />
              <div className="absolute right-0 top-12 z-40 w-48 overflow-hidden rounded-2xl agent-glass-card border border-white/10 p-1.5 shadow-2xl">
                <div className="border-b border-white/10 px-3 py-2 text-xs">
                  <div className="font-bold text-white">{formattedName}</div>
                  <div className="text-[11px] text-[#94A3B8] truncate">
                    {user?.email ?? "admin@savyron.com"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDropdownOpen(false);
                    router.push("/settings");
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-[#CBD5E1] transition-colors hover:bg-white/10 hover:text-white"
                >
                  <User className="h-3.5 w-3.5 text-[#94A3B8]" />
                  Configurações
                </button>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-[#EF4444] transition-colors hover:bg-red-500/20"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sair do sistema
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
