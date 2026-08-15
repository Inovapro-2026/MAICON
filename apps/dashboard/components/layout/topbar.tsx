'use client';

import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';

export function Topbar({ title }: { title: string }) {
  const router = useRouter();

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-zinc-200 bg-white/90 px-4 backdrop-blur lg:px-8">
      <h1 className="heading-strong text-lg">{title}</h1>
      <button
        onClick={() => void logout()}
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
      >
        <LogOut className="h-4 w-4" />
        <span className="hidden sm:inline">Sair</span>
      </button>
    </header>
  );
}
