"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Search,
  Megaphone,
  MessageSquare,
  Users,
  Mail,
  BarChart3,
  ShieldCheck,
  Bot,
  BookOpen,
  FlaskConical,
  Sparkles,
  ChevronDown,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { useSession } from "@/hooks/use-session";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/prospect", label: "Prospecção", icon: Search },
  { href: "/campaigns", label: "Campanhas", icon: Megaphone },
  { href: "/inbox", label: "Mensagens", icon: MessageSquare },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/emails", label: "E-mails enviados", icon: Mail },
  { href: "/reports", label: "Relatórios", icon: BarChart3 },
];

// Configuração unificada "Empresa + IA" (substitui Meu negócio + Configurar IA).
const EMPRESA_NAV = [{ href: "/settings/empresa-ia", label: "Configuração da IA", icon: Bot }];

// Opções avançadas mantidas acessíveis — "Guia de prompts" permanece como
// opção avançada (decisão de produto). "Meu negócio"/"Configurar IA" foram
// fundidos na tela unificada "/settings/empresa-ia" (não aparecem mais aqui).
const ADVANCED_NAV = [
  { href: "/ai/knowledge", label: "Base de conhecimento", icon: BookOpen },
  { href: "/ai/playground", label: "Testar IA", icon: FlaskConical },
  { href: "/ai/prompt-guide", label: "Guia de prompts", icon: Sparkles },
];

const ADMIN_LINK = { href: "/admin", label: "Admin", icon: ShieldCheck };

function NavItem({
  href,
  label,
  icon: Icon,
  pathname,
}: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  pathname: string;
}) {
  const active =
    pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-normal transition-colors ${
        active
          ? "bg-emerald-500/10 font-semibold text-emerald-600 hover:bg-emerald-500/15"
          : "text-muted-foreground hover:bg-zinc-100 hover:text-foreground"
      }`}
    >
      <Icon className="h-5 w-5" />
      {label}
    </Link>
  );
}

function AdvancedNav({
  items,
  pathname,
}: {
  items: { href: string; label: string; icon: typeof LayoutDashboard }[];
  pathname: string;
}) {
  const [open, setOpen] = useState(() => items.some((item) => pathname.startsWith(item.href)));
  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-zinc-100 hover:text-foreground"
      >
        Avançado
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="mt-1 space-y-1 pl-3">
          {items.map((item) => (
            <NavItem key={item.href} {...item} pathname={pathname} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useSession();
  // O link "Admin" só aparece para quem tem papel de plataforma. O dado vem do
  // backend (GET /auth/me) — nunca de localStorage/flag manipulável no client.
  const canSeeAdmin =
    user?.platform_role === "PLATFORM_ADMIN" ||
    user?.platform_role === "PLATFORM_STAFF";
  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-zinc-200 bg-zinc-50 lg:flex">
      <div className="divider-fluorescent px-6 py-5">
        <Link href="/dashboard">
          <Logo compact />
        </Link>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {NAV.map((item) => (
          <NavItem key={item.href} {...item} pathname={pathname} />
        ))}
        <div className="divider-fluorescent mx-1 mt-4 pt-4" />
        <div className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/80">
          Empresa
        </div>
        {EMPRESA_NAV.map((item) => (
          <NavItem key={item.href} {...item} pathname={pathname} />
        ))}
        <AdvancedNav items={ADVANCED_NAV} pathname={pathname} />
        {canSeeAdmin ? (
          <>
            <div className="divider-fluorescent mx-1 mt-4 pt-4" />
            <NavItem
              href={ADMIN_LINK.href}
              label={ADMIN_LINK.label}
              icon={ADMIN_LINK.icon}
              pathname={pathname}
            />
          </>
        ) : null}
      </nav>
      <div className="border-t border-zinc-200 px-6 py-4 text-[11px] text-muted-foreground/60">
        SAVYRON
      </div>
    </aside>
  );
}