"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Users, Search as SearchIcon } from "lucide-react";
import { DashboardShell } from "@/components/layout/shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useApi, request } from "@/hooks/use-api";
import { ClientCard, Client } from "@/components/clients/client-card";
import { InboxSkeletonCards } from "@/components/inbox/skeleton-cards";

const PAGE_SIZE = 24;

interface ClientsResponse {
  total: number;
  page: number;
  pageSize: number;
  clients: Client[];
}

/**
 * Aba "Clientes".
 *
 * TODO(contrato): confirmar shapes reais em API_CONTRACT_REESTRUTURACAO.md quando
 * disponível — GET /clients, GET /clients/:id e GET /clients/:id/conversation.
 * Formatos abaixo seguem a seção 4 do prompt de reestruturação.
 */
export default function ClientesPage() {
  const router = useRouter();
  const { error: toastError } = useToast();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    if (search.trim()) params.set("search", search.trim());
    return params.toString();
  }, [search, page]);

  const clientsQuery = useApi<ClientsResponse>(
    ["clients", search, String(page)],
    `clients?${query}`,
  );

  const clients = clientsQuery.data?.clients ?? [];
  const total = clientsQuery.data?.total ?? clients.length;

  // Reset da página ao pesquisar.
  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const openConversation = async (client: Client) => {
    setOpeningId(client.id);
    try {
      const res = await request<{ conversationId: string }>(
        `clients/${client.id}/conversation`,
      );
      if (res?.conversationId) {
        router.push(`/inbox/${res.conversationId}`);
      } else {
        toastError("Nenhuma conversa vinculada a este cliente.");
      }
    } catch {
      // Nunca criamos conversa a partir do clique — apenas abrimos a existente.
      toastError("Nenhuma conversa vinculada a este cliente.");
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <DashboardShell title="Clientes">
      <div className="space-y-4">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Buscar cliente por nome, telefone ou segmento..."
            className="w-full rounded-xl border border-zinc-300 bg-white py-2.5 pl-10 pr-4 text-sm text-zinc-900 placeholder-zinc-400 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
          />
        </div>

        {clientsQuery.isLoading ? (
          <InboxSkeletonCards count={8} />
        ) : clients.length > 0 ? (
          <>
            <p className="text-xs text-zinc-500">
              {total} cliente{total === 1 ? "" : "s"}
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {clients.map((c) => (
                <ClientCard
                  key={c.id}
                  client={c}
                  opening={openingId === c.id}
                  onOpen={() => void openConversation(c)}
                />
              ))}
            </div>
            {clients.length < total ? (
              <div className="flex justify-center pt-2">
                <Button
                  variant="outline"
                  onClick={() => setPage((p) => p + 1)}
                  loading={clientsQuery.isFetching}
                >
                  Carregar mais
                </Button>
              </div>
            ) : null}
          </>
        ) : (
          <Card className="py-16 text-center">
            <Users className="mx-auto mb-3 h-10 w-10 text-zinc-700" />
            <div className="text-sm text-zinc-500">
              {search.trim()
                ? "Nenhum cliente encontrado para esta busca."
                : "Nenhum cliente cadastrado ainda."}
            </div>
          </Card>
        )}
      </div>
    </DashboardShell>
  );
}
