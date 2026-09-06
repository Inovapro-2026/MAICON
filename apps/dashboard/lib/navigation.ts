"use client";

import type { LucideIcon } from "lucide-react";
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
  Plug,
  BookOpen,
  FlaskConical,
  Sparkles,
  ShieldCheck,
  Settings,
  Calendar,
  Wallet,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Exibido na bottom navigation mobile. */
  mobileBottom?: boolean;
  /** Ação central destacada na bottom navigation. */
  center?: boolean;
  /** Grupo de navegação (para o drawer "Mais" e sidebar). */
  group?: "main" | "empresa" | "advanced" | "admin" | "settings";
  /** true quando exige papel de plataforma (admin/staff). */
  requiresPlatform?: boolean;
}

/** Fonte única de navegação — desktop (sidebar) e mobile (bottom + Mais). */
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Início", icon: LayoutDashboard, mobileBottom: true, group: "main" },
  { href: "/agente", label: "Agente", icon: Mic, mobileBottom: true, center: true, group: "main" },
  { href: "/prospect", label: "Prospecção", icon: Search, mobileBottom: true, group: "main" },
  { href: "/inbox", label: "Mensagens", icon: MessageSquare, mobileBottom: true, group: "main" },
  { href: "/campaigns", label: "Campanhas", icon: Megaphone, group: "main" },
  { href: "/clientes", label: "Clientes", icon: Users, group: "main" },
  { href: "/emails", label: "E-mails enviados", icon: Mail, group: "main" },
  { href: "/reports", label: "Relatórios", icon: BarChart3, group: "main" },
  { href: "/agenda", label: "Agenda", icon: Calendar, group: "main" },
  { href: "/financeiro", label: "Financeiro", icon: Wallet, group: "main" },
];

/** Itens "Empresa" — visíveis no drawer Mais e na sidebar. */
export const EMPRESA_NAV: NavItem[] = [
  { href: "/settings/empresa-ia", label: "Configuração da IA", icon: Bot, group: "empresa" },
  { href: "/settings/plano", label: "Planos", icon: Crown, group: "empresa" },
];

/** Itens "Avançado" — visíveis no drawer Mais e na sidebar. */
export const ADVANCED_NAV: NavItem[] = [
  { href: "/settings", label: "Integrações", icon: Plug, group: "advanced" },
  { href: "/ai/knowledge", label: "Base de conhecimento", icon: BookOpen, group: "advanced" },
  { href: "/ai/playground", label: "Testar IA", icon: FlaskConical, group: "advanced" },
  { href: "/ai/prompt-guide", label: "Guia de prompts", icon: Sparkles, group: "advanced" },
];

/** Admin (exige PLATFORM_ADMIN/STAFF). */
export const ADMIN_NAV: NavItem = {
  href: "/admin",
  label: "Admin",
  icon: ShieldCheck,
  group: "admin",
  requiresPlatform: true,
};

/** Configurações gerais. */
export const SETTINGS_NAV: NavItem = {
  href: "/settings",
  label: "Configurações",
  icon: Settings,
  group: "settings",
};

/** Agrupamento para o drawer "Mais" mobile. */
export const MORE_GROUPS: Array<{ title: string; items: NavItem[] }> = [
  { title: "Geral", items: NAV_ITEMS.filter((i) => i.group === "main" && !i.mobileBottom) },
  { title: "Empresa", items: EMPRESA_NAV },
  { title: "Avançado", items: ADVANCED_NAV },
];
