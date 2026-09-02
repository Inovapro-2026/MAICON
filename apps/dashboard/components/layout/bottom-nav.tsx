"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Search,
  MessageSquare,
  Mic,
  Megaphone,
  Users,
  Mail,
  BarChart3,
  Bot,
  Crown,
  BookOpen,
  FlaskConical,
  Sparkles,
  ShieldCheck,
  Settings,
  X,
  ChevronRight,
  HelpCircle,
  ChevronDown,
  Plug,
} from "lucide-react";
import { NAV_ITEMS, EMPRESA_NAV, ADVANCED_NAV, ADMIN_NAV, SETTINGS_NAV } from "@/lib/navigation";
import { useSession } from "@/hooks/use-session";

const BOTTOM_ITEMS = NAV_ITEMS.filter((i) => i.mobileBottom);

export function BottomNav() {
  const pathname = usePathname();
  const { user } = useSession();
  const [moreOpen, setMoreOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const canSeeAdmin =
    user?.platform_role === "PLATFORM_ADMIN" || user?.platform_role === "PLATFORM_STAFF";

  const isActive = (href: string) =>
    pathname === href || (href !== "/dashboard" && pathname.startsWith(href));

  return (
    <>
      {/* Bottom navigation bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 border-t border-[#E6E8F0] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden shadow-[0_-4px_16px_rgba(15,23,42,0.04)]"
        aria-label="Navegação principal"
      >
        <div className="flex items-stretch justify-around">
          {BOTTOM_ITEMS.map(({ href, label, icon: Icon, center }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? "page" : undefined}
              aria-label={center ? "Abrir Agente de Voz" : label}
              className={`relative flex min-w-0 flex-1 flex-col items-center py-2 transition-colors ${
                center ? "justify-end pb-2" : "justify-center gap-1"
              } ${isActive(href) && !center ? "text-[#6366F1] font-semibold" : "text-[#64748B]"}`}
            >
              {center ? (
                <span
                  className={`flex h-14 w-14 -translate-y-4 items-center justify-center rounded-full shadow-lg ring-4 transition-all ${
                    isActive(href)
                      ? "bg-[#6366F1] text-white ring-[#6366F1]/25 shadow-[0_8px_24px_rgba(99,102,241,0.45)]"
                      : "bg-[#6366F1] text-white ring-white shadow-[0_6px_20px_rgba(99,102,241,0.35)]"
                  }`}
                >
                  <Icon className="h-7 w-7" />
                </span>
              ) : (
                <Icon
                  className={`h-5 w-5 ${isActive(href) ? "text-[#6366F1]" : "text-[#64748B]"}`}
                />
              )}

              {!center ? (
                <span className={`text-[10px] ${isActive(href) ? "text-[#6366F1]" : "text-[#64748B]"}`}>
                  {label}
                </span>
              ) : (
                <span className={`-mt-3 text-[10px] ${isActive(href) ? "text-[#6366F1]" : "text-[#64748B]"}`}>
                  {label}
                </span>
              )}
            </Link>
          ))}

          {/* Botão "Mais" */}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-label="Abrir mais opções"
            className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 py-2 text-[#64748B] transition-colors"
          >
            <span className="flex h-7 w-7 items-center justify-center">
              <span className="flex h-1.5 w-1.5 gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="h-0.5 w-4 rounded-full bg-current" />
                <span className="h-0.5 w-4 rounded-full bg-current" />
                <span className="h-0.5 w-4 rounded-full bg-current" />
              </span>
            </span>
            <span className="text-[10px]">Mais</span>
          </button>
        </div>
      </nav>

      {/* "Mais" drawer overlay */}
      {moreOpen ? (
        <div className="fixed inset-0 z-30 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setMoreOpen(false)}
          />
          <div className="absolute bottom-0 left-0 right-0 max-h-[85vh] overflow-y-auto rounded-t-3xl bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#F1F5F9] bg-white px-5 py-4">
              <h2 className="text-base font-bold text-[#0F172A]">Navegar</h2>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="rounded-xl p-1.5 text-[#64748B] hover:bg-slate-100 transition-colors"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-5 pb-6 pt-3">
              {/* Geral */}
              <DrawerSection
                title="Geral"
                items={NAV_ITEMS.filter((i) => i.group === "main" && !i.mobileBottom)}
                pathname={pathname}
                onNavigate={() => setMoreOpen(false)}
              />

              {/* Empresa */}
              <DrawerSection
                title="Empresa"
                items={EMPRESA_NAV}
                pathname={pathname}
                onNavigate={() => setMoreOpen(false)}
              />

              {/* Avançado */}
              <div className="mb-4">
                <button
                  type="button"
                  onClick={() => setAdvancedOpen((v) => !v)}
                  aria-expanded={advancedOpen}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-bold uppercase tracking-wider text-[#94A3B8] transition-colors"
                >
                  Avançado
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform ${advancedOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {advancedOpen ? (
                  <div className="mt-1 pl-1">
                    {ADVANCED_NAV.map((item) => (
                      <DrawerItem key={item.href} {...item} pathname={pathname} onNavigate={() => setMoreOpen(false)} />
                    ))}
                  </div>
                ) : null}
              </div>

              {/* Admin (se tiver permissão) */}
              {canSeeAdmin ? (
                <div className="mb-4">
                  <DrawerItem {...ADMIN_NAV} pathname={pathname} onNavigate={() => setMoreOpen(false)} />
                </div>
              ) : null}

              {/* Configurações */}
              <div className="pt-2 border-t border-[#F1F5F9]">
                <DrawerItem {...SETTINGS_NAV} pathname={pathname} onNavigate={() => setMoreOpen(false)} />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function DrawerSection({
  title,
  items,
  pathname,
  onNavigate,
}: {
  title: string;
  items: { href: string; label: string; icon: typeof LayoutDashboard }[];
  pathname: string;
  onNavigate: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mb-4">
      <div className="mb-1 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
        {title}
      </div>
      {items.map((item) => (
        <DrawerItem key={item.href} {...item} pathname={pathname} onNavigate={onNavigate} />
      ))}
    </div>
  );
}

function DrawerItem({
  href,
  label,
  icon: Icon,
  pathname,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  pathname: string;
  onNavigate: () => void;
}) {
  const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
        active
          ? "bg-[#EEF2FF] text-[#6366F1] font-semibold"
          : "text-[#475569] hover:bg-slate-50"
      }`}
    >
      <Icon className={`h-4.5 w-4.5 shrink-0 ${active ? "text-[#6366F1]" : "text-[#64748B]"}`} />
      <span className="truncate">{label}</span>
      <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-[#CBD5E1]" />
    </Link>
  );
}