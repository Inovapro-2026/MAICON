"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  Settings,
  Crown,
  HelpCircle,
  Zap,
  Plug,
  ScrollText,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { useSession } from "@/hooks/use-session";
import { useApi } from "@/hooks/use-api";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/prospect", label: "Prospecção", icon: Search },
  { href: "/campaigns", label: "Campanhas", icon: Megaphone },
  { href: "/inbox", label: "Mensagens", icon: MessageSquare },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/emails", label: "E-mails enviados", icon: Mail },
  { href: "/reports", label: "Relatórios", icon: BarChart3 },
];

const EMPRESA_NAV = [
  { href: "/settings/empresa-ia", label: "Configuração da IA", icon: Bot },
  { href: "/settings/plano", label: "Planos", icon: Crown },
];

const ADVANCED_NAV = [
  { href: "/settings", label: "Integrações", icon: Plug },
  { href: "/ai/knowledge", label: "Base de conhecimento", icon: BookOpen },
  { href: "/ai/playground", label: "Testar IA", icon: FlaskConical },
  { href: "/ai/prompt-guide", label: "Guia de prompts", icon: Sparkles },
];

const ADMIN_LINK = { href: "/admin", label: "Logs & Admin", icon: ShieldCheck };
const SETTINGS_LINK = { href: "/settings", label: "Configurações", icon: Settings };

function NavItem({
  href,
  label,
  icon: Icon,
  pathname,
  navigateTo,
}: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  pathname: string;
  navigateTo?: string;
}) {
  const router = useRouter();
  const active =
    pathname === href || (href !== "/dashboard" && pathname.startsWith(href));

  const className = `group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-150 ${
    active
      ? "bg-[#EEF2FF] text-[#6366F1] font-semibold shadow-xs"
      : "text-[#475569] hover:bg-slate-50 hover:text-[#0F172A]"
  }`;

  const iconClass = `h-4.5 w-4.5 shrink-0 transition-colors ${
    active ? "text-[#6366F1]" : "text-[#64748B] group-hover:text-[#0F172A]"
  }`;

  if (navigateTo && navigateTo !== href) {
    return (
      <button type="button" onClick={() => router.push(navigateTo)} className={`w-full text-left ${className}`}>
        <Icon className={iconClass} />
        <span className="truncate">{label}</span>
      </button>
    );
  }

  return (
    <Link href={href} className={className}>
      <Icon className={iconClass} />
      <span className="truncate">{label}</span>
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
        className="flex w-full items-center justify-between rounded-xl px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-[#94A3B8] transition-colors hover:bg-slate-50 hover:text-[#475569]"
      >
        Avançado
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="mt-1 space-y-0.5 pl-1">
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

  const campaigns = useApi<Array<{ id: string }>>(
    ["sidebar-campaigns"],
    "campaigns",
    { refetchInterval: 60000 }
  );
  const campaignTarget =
    campaigns.data && campaigns.data.length > 0
      ? `/campaigns/${campaigns.data[0].id}`
      : "/campaigns";

  const canSeeAdmin =
    user?.platform_role === "PLATFORM_ADMIN" ||
    user?.platform_role === "PLATFORM_STAFF";

  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-[#E6E8F0] bg-white lg:flex shadow-[1px_0_4px_rgba(15,23,42,0.02)]">
      {/* Brand logo */}
      <div className="border-b border-[#E6E8F0] px-6 py-5">
        <Link href="/dashboard" className="inline-block">
          <Logo compact />
        </Link>
      </div>

      {/* Navigation menu */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3.5 py-4">
        {NAV.map((item) => (
          <NavItem
            key={item.href}
            {...item}
            pathname={pathname}
            navigateTo={item.href === "/campaigns" ? campaignTarget : undefined}
          />
        ))}

        <div className="my-3 border-t border-[#F1F5F9]" />

        <div className="px-3.5 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
          Empresa
        </div>
        {EMPRESA_NAV.map((item) => (
          <NavItem key={item.href} {...item} pathname={pathname} />
        ))}

        <div className="my-3 border-t border-[#F1F5F9]" />

        <AdvancedNav items={ADVANCED_NAV} pathname={pathname} />

        {canSeeAdmin ? (
          <NavItem
            href={ADMIN_LINK.href}
            label={ADMIN_LINK.label}
            icon={ADMIN_LINK.icon}
            pathname={pathname}
          />
        ) : null}

        <NavItem
          href={SETTINGS_LINK.href}
          label={SETTINGS_LINK.label}
          icon={SETTINGS_LINK.icon}
          pathname={pathname}
        />
      </nav>

      {/* Central de ajuda card */}
      <div className="p-3.5">
        <div className="flex items-center gap-3 rounded-2xl bg-[#F8FAFC] border border-[#E6E8F0] p-3 transition-colors hover:bg-slate-100/70">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EEF2FF] text-[#6366F1]">
            <HelpCircle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-[#0F172A]">Central de ajuda</div>
            <div className="text-[11px] text-[#64748B] truncate">Tutoriais e suporte</div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-[#E6E8F0] px-5 py-3 text-[11px] text-[#94A3B8]">
        <div className="font-semibold text-[#64748B]">SAVYRON</div>
        <div className="text-[10px]">© 2026 Todos os direitos reservados.</div>
      </div>
    </aside>
  );
}