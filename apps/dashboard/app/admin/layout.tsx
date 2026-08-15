import { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Logo } from "@/components/logo";
import {
  LayoutDashboard,
  Building2,
  CreditCard,
  Receipt,
  Users,
  ScrollText,
  Activity,
  Settings,
  ArrowLeft,
} from "lucide-react";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/businesses", label: "Empresas", icon: Building2 },
  { href: "/admin/plans", label: "Planos", icon: CreditCard },
  { href: "/admin/subscriptions", label: "Assinaturas", icon: Receipt },
  { href: "/admin/payments", label: "Pagamentos", icon: Receipt },
  { href: "/admin/users", label: "Usuários", icon: Users },
  { href: "/admin/usage", label: "Uso", icon: Activity },
  { href: "/admin/audit", label: "Auditoria", icon: ScrollText },
  { href: "/admin/settings", label: "Configurações", icon: Settings },
];

export const metadata = { title: "Admin — SAVYRON" };

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  if (
    session.platform_role !== "PLATFORM_ADMIN" &&
    session.platform_role !== "PLATFORM_STAFF"
  ) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-zinc-50 lg:flex">
      {session.impersonating ? (
        <div className="fixed inset-x-0 top-0 z-50 bg-amber-500/90 px-4 py-2 text-center text-xs font-medium text-zinc-900">
          Você está acessando esta empresa como administrador da plataforma
          {session.impersonator ? ` (${session.impersonator})` : ""}.
          <Link href="/admin/impersonate/exit" className="ml-2 underline">
            Sair do modo de suporte
          </Link>
        </div>
      ) : null}

      <aside className="hidden w-60 shrink-0 flex-col border-r border-zinc-200 bg-zinc-50 lg:flex">
        <div className="border-b border-zinc-200 px-5 py-4">
          <Logo compact />
          <div className="mt-1 text-[11px] text-zinc-500">
            Painel administrativo
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
          <div className="pt-4">
            <Link
              href="/dashboard"
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar ao painel
            </Link>
          </div>
        </nav>
      </aside>

      <main className="min-w-0 flex-1 pt-10 lg:pt-0">
        <div className="border-b border-zinc-200 px-4 py-3 lg:hidden">
          <Logo compact />
        </div>
        <div className="p-4 lg:p-6">{children}</div>
      </main>
    </div>
  );
}
