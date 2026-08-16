"use client";

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
  Settings,
} from "lucide-react";

const NAV = [
  { href: "/dashboard", label: "Início", icon: LayoutDashboard },
  { href: "/prospect", label: "Prospecção", icon: Search },
  { href: "/campaigns", label: "Campanhas", icon: Megaphone },
  { href: "/inbox", label: "Mensagens", icon: MessageSquare },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/emails", label: "E-mails", icon: Mail },
  { href: "/reports", label: "Relatórios", icon: BarChart3 },
  { href: "/settings", label: "Ajustes", icon: Settings },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <div className="scrollbar-thin flex items-stretch overflow-x-auto">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href ||
            (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className="flex min-w-[64px] flex-1 flex-col items-center justify-center gap-1 py-2"
            >
              <Icon
                className={`h-5 w-5 ${active ? "text-emerald-600" : "text-muted-foreground"}`}
              />
              <span
                className={`text-[10px] ${active ? "text-emerald-600" : "text-muted-foreground"}`}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}