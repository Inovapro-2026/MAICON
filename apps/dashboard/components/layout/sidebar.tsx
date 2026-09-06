"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronDown,
  HelpCircle,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { useSession } from "@/hooks/use-session";
import { useApi } from "@/hooks/use-api";
import {
  NAV_ITEMS,
  EMPRESA_NAV,
  ADVANCED_NAV,
  ADMIN_NAV,
  SETTINGS_NAV,
  NavItem as NavItemDef,
} from "@/lib/navigation";

function NavItem({
  href,
  label,
  icon: Icon,
  pathname,
  navigateTo,
  collapsed,
}: {
  href: string;
  label: string;
  icon: NavItemDef["icon"];
  pathname: string;
  navigateTo?: string;
  collapsed?: boolean;
}) {
  const router = useRouter();
  const active =
    pathname === href || (href !== "/dashboard" && pathname.startsWith(href));

  const className = `group flex items-center gap-3 rounded-xl py-2.5 text-sm font-medium transition-all duration-150 ${
    collapsed ? "justify-center px-2.5" : "px-3.5"
  } ${
    active
      ? "bg-[#EEF2FF] text-[#6366F1] font-semibold shadow-xs"
      : "text-[#475569] hover:bg-slate-50 hover:text-[#0F172A]"
  }`;

  const iconClass = `h-4.5 w-4.5 shrink-0 transition-colors ${
    active ? "text-[#6366F1]" : "text-[#64748B] group-hover:text-[#0F172A]"
  }`;

  if (navigateTo && navigateTo !== href) {
    return (
      <button type="button" onClick={() => router.push(navigateTo)} className={`w-full text-left ${className}`} title={collapsed ? label : undefined}>
        <Icon className={iconClass} />
        {!collapsed && <span className="truncate">{label}</span>}
      </button>
    );
  }

  return (
    <Link href={href} className={className} title={collapsed ? label : undefined}>
      <Icon className={iconClass} />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}

function AdvancedNav({
  items,
  pathname,
  collapsed,
}: {
  items: NavItemDef[];
  pathname: string;
  collapsed?: boolean;
}) {
  const [open, setOpen] = useState(() => items.some((item) => pathname.startsWith(item.href)));
  if (collapsed) {
    return (
      <div className="mt-1">
        {items.map((item) => (
          <NavItem key={item.href} {...item} pathname={pathname} collapsed />
        ))}
      </div>
    );
  }
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

export function Sidebar({
  collapsed = false,
  onToggleCollapsed,
}: {
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}) {
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
    <aside
      className={`fixed inset-y-0 left-0 z-20 hidden flex-col border-r border-[#E6E8F0] bg-white lg:flex shadow-[1px_0_4px_rgba(15,23,42,0.02)] transition-[width] duration-200 ${
        collapsed ? "w-20" : "w-64"
      }`}
    >
      {/* Brand logo + botão recolher/expandir */}
      <div className="flex items-center justify-between gap-1 border-b border-[#E6E8F0] px-4 py-5">
        {!collapsed ? (
          <Link href="/dashboard" className="inline-block">
            <Logo compact />
          </Link>
        ) : (
          <Link
            href="/dashboard"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#EEF2FF] text-[#6366F1]"
            aria-label="Início"
          >
            <Logo compact className="h-6 w-6" />
          </Link>
        )}
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          title={collapsed ? "Expandir menu" : "Recolher menu"}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[#94A3B8] transition-colors hover:bg-slate-100 hover:text-[#0F172A]"
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4.5 w-4.5" />
          ) : (
            <PanelLeftClose className="h-4.5 w-4.5" />
          )}
        </button>
      </div>

      {/* Navigation menu */}
      <nav
        className={`flex-1 space-y-1 overflow-y-auto py-4 ${
          collapsed ? "px-2.5" : "px-3.5"
        }`}
      >
        {NAV_ITEMS.map((item) => (
          <NavItem
            key={item.href}
            {...item}
            pathname={pathname}
            collapsed={collapsed}
            navigateTo={item.href === "/campaigns" ? campaignTarget : undefined}
          />
        ))}

        <div className="my-3 border-t border-[#F1F5F9]" />

        {!collapsed ? (
          <div className="px-3.5 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
            Empresa
          </div>
        ) : null}
        {EMPRESA_NAV.map((item) => (
          <NavItem key={item.href} {...item} pathname={pathname} collapsed={collapsed} />
        ))}

        <div className="my-3 border-t border-[#F1F5F9]" />

        <AdvancedNav items={ADVANCED_NAV} pathname={pathname} collapsed={collapsed} />

        {canSeeAdmin ? (
          <NavItem
            href={ADMIN_NAV.href}
            label={ADMIN_NAV.label}
            icon={ADMIN_NAV.icon}
            pathname={pathname}
            collapsed={collapsed}
          />
        ) : null}

        <NavItem
          href={SETTINGS_NAV.href}
          label={SETTINGS_NAV.label}
          icon={SETTINGS_NAV.icon}
          pathname={pathname}
          collapsed={collapsed}
        />
      </nav>

      {/* Central de ajuda card */}
      <div className={collapsed ? "p-2.5" : "p-3.5"}>
        <div
          className={`flex items-center gap-3 rounded-2xl bg-[#F8FAFC] border border-[#E6E8F0] p-3 transition-colors hover:bg-slate-100/70 ${
            collapsed ? "justify-center" : ""
          }`}
          title={collapsed ? "Central de ajuda" : undefined}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EEF2FF] text-[#6366F1]">
            <HelpCircle className="h-5 w-5" />
          </div>
          {!collapsed ? (
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-[#0F172A]">Central de ajuda</div>
              <div className="text-[11px] text-[#64748B] truncate">Tutoriais e suporte</div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Footer */}
      <div className={`border-t border-[#E6E8F0] py-3 text-[11px] text-[#94A3B8] ${collapsed ? "px-2 text-center" : "px-5"}`}>
        <div className="font-semibold text-[#64748B]">{collapsed ? "S" : "SAVYRON"}</div>
        {!collapsed ? (
          <div className="text-[10px]">© 2026 Todos os direitos reservados.</div>
        ) : null}
      </div>
    </aside>
  );
}