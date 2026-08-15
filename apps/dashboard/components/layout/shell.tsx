"use client";

import { useEffect } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Topbar } from "@/components/layout/topbar";
import { OfflineBanner } from "@/components/realtime/offline-banner";
import { realtimeClient } from "@/lib/socket-client";

export function DashboardShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  // Inicia a conexão Socket.IO (singleton) assim que o painel monta, em qualquer
  // rota. Sem isso, o banner "offline" ficaria visível em telas que não
  // assinam eventos (ex.: /prospect), mesmo com o tempo real funcionando.
  useEffect(() => {
    void realtimeClient.getSocket();
  }, []);

  return (
    <>
      <Sidebar />
      <div className="flex min-h-screen flex-col lg:pl-64">
        <Topbar title={title} />
        <OfflineBanner />
        <main className="flex-1 pb-20 lg:pb-8">
          <div className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-8">
            {children}
          </div>
        </main>
        <BottomNav />
      </div>
    </>
  );
}
