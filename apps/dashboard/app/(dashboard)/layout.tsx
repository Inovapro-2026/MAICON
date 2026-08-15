import { ReactNode } from 'react';
import Link from 'next/link';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function DashboardGroupLayout({ children }: { children: ReactNode }) {
  const session = await getSession();

  return (
    <>
      {session?.impersonating ? (
        <div className="fixed inset-x-0 top-0 z-50 bg-amber-500/90 px-4 py-2 text-center text-xs font-medium text-zinc-900">
          Você está acessando esta empresa como administrador da plataforma
          {session.impersonator ? ` (${session.impersonator})` : ''}.
          <Link href="/admin/impersonate/exit" className="ml-2 underline">
            Sair do modo de suporte
          </Link>
        </div>
      ) : null}
      {children}
    </>
  );
}