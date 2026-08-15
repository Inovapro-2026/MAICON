"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Search,
  MapPin,
  Users,
  Phone,
  Mail,
  Ban,
  Loader2,
  Sparkles,
  Globe,
  TrendingUp,
  Copy,
  ExternalLink,
  Trash2,
  Lock,
} from "lucide-react";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { Button, Spinner } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { useToast } from "@/components/ui/toast";
import { useApi, request } from "@/hooks/use-api";
import { useRealtime } from "@/hooks/use-realtime";
import { useSession } from "@/hooks/use-session";
import { useQueryClient } from "@tanstack/react-query";

interface ProspectionRun {
  id: string;
  segment: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  target_quantity: number;
  status:
    | "PENDING" | "RUNNING" | "COMPLETED" | "PARTIAL" | "FAILED" | "CANCELLED";
  found_count: number;
  saved_count: number;
  duplicate_count: number;
  discarded_count: number;
  error_count: number;
  phone_count: number;
  email_count: number;
  avg_score: number | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
}

interface ProspectionLead {
  id: string;
  name: string | null;
  business_name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  website: string | null;
  source_type: string | null;
  lead_score: number | null;
  collected_at: string | null;
  created_at: string;
}

interface LeadsResponse {
  runId: string;
  total: number;
  leads: ProspectionLead[];
}

interface ProspectionRunDetail extends ProspectionRun {
  summary?: Record<string, unknown> | null;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
}

const ACTIVE_STATUSES = ["PENDING", "RUNNING"];

const STATUS_TONE: Record<
  string,
  "zinc" | "amber" | "emerald" | "blue" | "red"
> = {
  PENDING: "amber",
  RUNNING: "blue",
  COMPLETED: "emerald",
  PARTIAL: "amber",
  FAILED: "red",
  CANCELLED: "zinc",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendente",
  RUNNING: "Em andamento",
  COMPLETED: "Concluída",
  PARTIAL: "Concluída parcialmente",
  FAILED: "Falhou",
  CANCELLED: "Cancelada",
};

function formatRelativeTime(
  iso: string | null | undefined,
  now: number,
): string {
  if (!iso) return "—";
  const diff = Math.max(0, now - new Date(iso).getTime());
  if (diff < 1000) return "agora";
  const s = Math.floor(diff / 1000);
  if (s < 60) return `há ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function locationLabel(
  run: Pick<ProspectionRun, "country" | "city" | "state">,
): string {
  const parts = [run.city, run.state, run.country].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Qualquer local";
}

export function ProspectTab() {
  const { success, error: toastError } = useToast();
  const queryClient = useQueryClient();

  // Progresso em tempo real via Socket.IO (além do polling de 5s): quando o
  // worker publica prospecting_progress, invalida as queries para refletir
  // salvos/alvo, Encontrados, Novos, Duplicados e C/telefone durante a execução.
  useRealtime({
    prospecting_progress: (event) => {
      if (!event.prospectingRunId) return;
      queryClient.invalidateQueries({ queryKey: ["prospections"] });
      queryClient.invalidateQueries({
        queryKey: ["prospection-leads", event.prospectingRunId],
      });
      queryClient.invalidateQueries({
        queryKey: ["prospection-detail", event.prospectingRunId],
      });
    },
  });

  const [segment, setSegment] = useState("");
  const [country, setCountry] = useState("");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [targetQuantity, setTargetQuantity] = useState("50");
  const [campaignId, setCampaignId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProspectionRun | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [now, setNow] = useState(Date.now());

  const campaigns = useApi<Campaign[]>(["campaigns"], "campaigns");

  const {
    data: runs = [],
    isLoading,
    refetch,
  } = useApi<ProspectionRun[]>(["prospections"], "/leads/prospections", {
    refetchInterval: 5000,
  });

  const activeRun = useMemo(
    () => runs.find((r) => ACTIVE_STATUSES.includes(r.status)),
    [runs],
  );

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (runs.length === 0) {
      setSelectedRunId(null);
      return;
    }
    if (!selectedRunId || !runs.some((r) => r.id === selectedRunId)) {
      setSelectedRunId(activeRun?.id ?? runs[0].id);
    }
  }, [runs, selectedRunId, activeRun]);

  const selectedRun = runs.find((r) => r.id === selectedRunId) ?? null;
  const showResults =
    Boolean(selectedRun) && !["PENDING"].includes(selectedRun?.status ?? "");

  const { data: leadsData, isLoading: leadsLoading } = useApi<LeadsResponse>(
    ["prospection-leads", selectedRunId ?? ""],
    `/leads/prospections/${selectedRunId}/leads`,
    { enabled: Boolean(selectedRunId) && showResults, refetchInterval: 10000 },
  );

  const detailEnabled =
    Boolean(selectedRun) && selectedRun?.status === "FAILED";
  const { data: runDetail } = useApi<ProspectionRunDetail>(
    ["prospection-detail", selectedRunId ?? ""],
    `/leads/prospections/${selectedRunId}`,
    { enabled: detailEnabled, refetchInterval: 10000 },
  );

  const runError =
    typeof runDetail?.summary?.error === "string"
      ? runDetail.summary.error
      : null;

  const hasActive = Boolean(activeRun);

  // Plano atual da empresa: prospecção web automática é restrita à feature
  // `prospeccao_web` (habilitada no plano Empresa). PLATFORM_ADMIN tem acesso
  // total (ignora restrição de plano) — o backend também valida isso.
  const business = useApi<{
    plan:
      | { slug: string | null; name: string | null; features: Record<string, boolean> }
      | null;
  }>(["business-settings"], "business/settings");
  const { user: sessionUser } = useSession();
  const isPlatformAdmin = sessionUser?.platform_role === "PLATFORM_ADMIN";
  const webProspectingEnabled =
    isPlatformAdmin ||
    Boolean(business.data?.plan?.features?.prospeccao_web);
  const planLoading = business.isLoading;

  async function startProspection() {
    if (!segment.trim() && !city.trim() && !state.trim()) {
      toastError("Informe o segmento (ex: barbearia) ou a cidade/estado alvo.");
      return;
    }
    const target = Number(targetQuantity);
    if (!Number.isFinite(target) || target < 1) {
      toastError("Defina uma quantidade válida de leads (>= 1).");
      return;
    }

    setSubmitting(true);
    try {
      await request("/leads/prospect", {
        method: "POST",
        body: {
          campaignId: campaignId || undefined,
          segment: segment.trim() || undefined,
          country: country.trim() || undefined,
          state: state.trim() || undefined,
          city: city.trim() || undefined,
          targetQuantity: target,
        },
      });
      success("Prospecção iniciada. Acompanhe o progresso abaixo.");
      setSegment("");
      setCountry("");
      setState("");
      setCity("");
      setTargetQuantity("50");
      setCampaignId("");
      void refetch();
    } catch (err) {
      toastError(
        err instanceof Error ? err.message : "Falha ao iniciar prospecção.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelRun(id: string) {
    try {
      await request(`/leads/prospections/${id}/cancel`, {
        method: "POST",
        body: {},
      });
      success("Prospecção cancelada.");
      void refetch();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Falha ao cancelar.");
    }
  }

  async function deleteRun() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await request(`/leads/prospections/${deleteTarget.id}`, {
        method: "DELETE",
        body: {},
      });
      success("Prospecção excluída.");
      if (selectedRunId === deleteTarget.id) setSelectedRunId(null);
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["prospections"] });
      void refetch();
    } catch (err) {
      toastError(
        err instanceof Error ? err.message : "Falha ao excluir prospecção.",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Nova prospecção"
          subtitle="Encontre leads qualificados automaticamente na web, com base em nicho e localização"
          action={
            !planLoading && !webProspectingEnabled ? (
              <Badge tone="amber">Disponível no plano Empresa</Badge>
            ) : undefined
          }
        />
        {planLoading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : webProspectingEnabled ? (
          <div className="space-y-4">
            <div>
              <label className="label">Segmento / Nicho</label>
              <Input
                placeholder="ex: barbearia, salão de beleza, pet shop, clínica odontológica..."
                value={segment}
                onChange={(e) => setSegment(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="label">País</label>
                <Input
                  placeholder="ex: Brasil"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Estado (UF)</label>
                <Input
                  placeholder="ex: SP"
                  maxLength={2}
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Cidade</label>
                <Input
                  placeholder="ex: São Paulo"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Quantidade de leads</label>
                <Input
                  type="number"
                  min={1}
                  max={500}
                  value={targetQuantity}
                  onChange={(e) => setTargetQuantity(e.target.value)}
                />
              </div>
              <div>
                <label className="label">
                  Adicionar a uma campanha (opcional)
                </label>
                <select
                  value={campaignId}
                  onChange={(e) => setCampaignId(e.target.value)}
                  className="input"
                >
                  <option value="">Sem campanha (apenas leads)</option>
                  {campaigns.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {c.status}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <Button
              onClick={startProspection}
              disabled={submitting || hasActive}
              size="lg"
              className="w-full"
            >
              {submitting ? (
                <Spinner className="h-4 w-4" />
              ) : (
                <Search className="h-5 w-5" />
              )}
              {hasActive && !submitting
                ? "Já existe uma prospecção em andamento"
                : "PROSPECTAR"}
            </Button>
            <p className="text-xs text-zinc-500">
              A prospecção roda em segundo plano (fila BullMQ). Você poderá
              cancelar a qualquer momento.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
            <Lock className="h-8 w-8 text-zinc-300" />
            <p className="max-w-md text-sm text-zinc-600">
              A prospecção web automática (busca de leads por nicho e
              localização) está disponível apenas no plano{" "}
              <strong>Empresa</strong>. Faça upgrade do seu plano para usar
              este recurso.
            </p>
            <Link href="/payment">
              <Button>Fazer upgrade</Button>
            </Link>
          </div>
        )}
      </Card>

      {activeRun ? (
        <Card>
          <CardHeader
            title="Progresso da prospecção"
            subtitle={activeRun.segment || "Segmento geral"}
            action={
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-zinc-500">
                  Atualizado {formatRelativeTime(activeRun.updated_at, now)}
                </span>
                {activeRun.status === "RUNNING" ? (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-blue-600 animate-pulse"
                    title="Processo em andamento"
                  >
                    <span className="h-2 w-2 rounded-full bg-blue-500 animate-ping" />
                    Em andamento
                  </span>
                ) : (
                  <Badge tone={STATUS_TONE[activeRun.status] as "zinc"}>
                    {STATUS_LABEL[activeRun.status]}
                  </Badge>
                )}
              </div>
            }
          />
          <div className="space-y-4">
            <div>
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="text-zinc-600">
                  <MapPin className="mr-1 inline h-3.5 w-3.5 text-zinc-400" />
                  {locationLabel(activeRun)}
                </span>
                <span className="font-medium text-zinc-700">
                  {activeRun.saved_count}/{activeRun.target_quantity} leads
                </span>
              </div>
              <Progress
                value={activeRun.saved_count}
                max={activeRun.target_quantity}
                tone={activeRun.status === "RUNNING" ? "emerald" : "whatsapp"}
              />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Stat
                icon={<Search className="h-3.5 w-3.5" />}
                label="Encontrados"
                value={activeRun.found_count}
              />
              <Stat
                icon={<Users className="h-3.5 w-3.5" />}
                label="Novos leads"
                value={activeRun.saved_count}
              />
              <Stat
                icon={<Ban className="h-3.5 w-3.5" />}
                label="Sem contato"
                value={activeRun.discarded_count}
              />
              <Stat
                icon={<Copy className="h-3.5 w-3.5" />}
                label="Duplicados"
                value={activeRun.duplicate_count}
              />
              <Stat
                icon={<Phone className="h-3.5 w-3.5" />}
                label="C/ telefone"
                value={activeRun.phone_count}
              />
            </div>
            <div className="flex justify-end">
              <Button
                variant="danger"
                size="sm"
                onClick={() => cancelRun(activeRun.id)}
              >
                <Ban className="h-3.5 w-3.5" /> Cancelar
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Resultados"
          subtitle={
            selectedRun
              ? `Leads encontrados por "${selectedRun.segment || "segmento geral"}" — ${locationLabel(selectedRun)}`
              : "Selecione uma prospecção para ver os resultados"
          }
        />
        {/* Altura fixa + scroll: a tabela não expande a página quando novos
            leads chegam em tempo real. */}
        <div className="max-h-[440px] overflow-auto">
          {runError ? (
            <div className="m-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <strong className="font-semibold">A prospecção falhou:</strong>{" "}
              {runError}
            </div>
          ) : leadsLoading ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : !showResults || !leadsData ? (
            <div className="py-10 text-center text-sm text-zinc-500">
              <Sparkles className="mx-auto mb-2 h-8 w-8 text-zinc-300" />
              {selectedRun &&
              ["PENDING", "RUNNING"].includes(selectedRun.status)
                ? "A prospecção ainda está em andamento. Os resultados aparecem aqui em tempo real."
                : "Selecione uma prospecção na seção 'Minhas prospecções' para ver os resultados."}
            </div>
          ) : (() => {
            // Só exibe leads com telefone OU e-mail (contato utilizável).
            const contactLeads = leadsData.leads.filter(
              (l) => l.phone || l.email,
            );
            if (contactLeads.length === 0) {
              const segment = selectedRun?.segment || "segmento";
              const region = selectedRun
                ? locationLabel(selectedRun)
                : "";
              const found = selectedRun?.found_count ?? 0;
              const discarded = selectedRun?.discarded_count ?? 0;
              return (
                <div className="py-10 text-center text-sm text-zinc-500">
                  <Search className="mx-auto mb-2 h-8 w-8 text-zinc-300" />
                  {found > 0 ? (
                    <>
                      Encontramos <strong className="text-zinc-700">{found}</strong>{" "}
                      {segment}
                      {region && region !== "Qualquer local" ? ` em ${region}` : ""}
                      , mas{" "}
                      <strong className="text-zinc-700">
                        nenhum tinha telefone ou e-mail públicos disponíveis
                      </strong>{" "}
                      ({discarded > 0 ? `${discarded} descartados` : "todos sem contato"}).
                      Tente uma localização mais ampla ou um segmento diferente.
                    </>
                  ) : (
                    "Nenhum lead real encontrado para os critérios informados."
                  )}
                </div>
              );
            }
            return (
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="sticky top-0 bg-zinc-50 text-[11px] uppercase tracking-wider text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">Empresa</th>
                    <th className="px-4 py-3">Telefone</th>
                    <th className="px-4 py-3">E-mail</th>
                    <th className="px-4 py-3">Cidade</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Site</th>
                    <th className="px-4 py-3">Score</th>
                    <th className="px-4 py-3">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {contactLeads.map((lead) => (
                  <tr
                    key={lead.id}
                    className="border-t border-zinc-200 hover:bg-zinc-100/60"
                  >
                    <td className="max-w-[220px] px-4 py-2.5 font-medium text-zinc-800">
                      <span className="block truncate">
                        {lead.business_name ?? lead.name ?? "—"}
                      </span>
                      {lead.source_type ? (
                        <span className="text-[11px] text-zinc-400">
                          Fonte: {lead.source_type}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-zinc-600">
                      {lead.phone ? (
                        <a
                          href={`tel:${lead.phone}`}
                          className="hover:text-emerald-600"
                        >
                          {lead.phone}
                        </a>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-600">
                      {lead.email ? (
                        <a
                          href={`mailto:${lead.email}`}
                          className="hover:text-emerald-600"
                        >
                          {lead.email}
                        </a>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-500">
                      {lead.city ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-500">
                      {lead.state ?? "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      {lead.website ? (
                        <a
                          href={lead.website}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-emerald-600 hover:underline"
                        >
                          <Globe className="h-3 w-3" /> ver
                        </a>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {lead.lead_score != null ? (
                        <Badge
                          tone={
                            lead.lead_score >= 70
                              ? "emerald"
                              : lead.lead_score >= 40
                                ? "amber"
                                : "zinc"
                          }
                        >
                          {lead.lead_score}
                        </Badge>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-zinc-500">
                      {formatDate(lead.collected_at ?? lead.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            );
          })()}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Minhas prospecções"
          subtitle="Histórico e status de todas as execuções desta empresa"
          action={
            <Button variant="ghost" size="sm" onClick={() => void refetch()}>
              Atualizar
            </Button>
          }
        />
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : runs.length === 0 ? (
          <div className="py-10 text-center text-sm text-zinc-500">
            <Sparkles className="mx-auto mb-2 h-8 w-8 text-zinc-300" />
            Nenhuma prospecção ainda. Comece pela primeira!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Nicho</th>
                  <th className="px-4 py-3">Localização</th>
                  <th className="px-4 py-3">Solicitados</th>
                  <th className="px-4 py-3">Encontrados</th>
                  <th className="px-4 py-3">Novos</th>
                  <th className="px-4 py-3">Duplicados</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr
                    key={run.id}
                    onClick={() => setSelectedRunId(run.id)}
                    className={`cursor-pointer border-t border-zinc-200 hover:bg-zinc-100/60 ${selectedRunId === run.id ? "bg-emerald-50/60" : ""}`}
                  >
                    <td className="px-4 py-2.5 whitespace-nowrap text-zinc-500">
                      {formatDate(run.created_at)}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-zinc-800">
                      {run.segment || "Segmento geral"}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-500">
                      {locationLabel(run)}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-600">
                      {run.target_quantity}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-600">
                      {run.found_count}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-emerald-700">
                      {run.saved_count}
                    </td>
                    <td className="px-4 py-2.5 text-amber-600">
                      {run.duplicate_count}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={STATUS_TONE[run.status] as "zinc"}>
                        {STATUS_LABEL[run.status]}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        {ACTIVE_STATUSES.includes(run.status) ? (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              void cancelRun(run.id);
                            }}
                          >
                            <Ban className="h-3.5 w-3.5" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:bg-red-500/10 hover:text-red-600"
                            title="Excluir prospecção"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget(run);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRunId(run.id);
                          }}
                        >
                          <ExternalLink className="h-3.5 w-3.5" /> Ver
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Excluir prospecção"
        confirmText="EXCLUIR"
        confirmLabel="Excluir"
        loading={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void deleteRun()}
        message={
          <span>
            Excluir a prospecção de{" "}
            <strong className="text-zinc-900">
              {deleteTarget?.segment || "segmento geral"}
            </strong>{" "}
            ({deleteTarget?.saved_count ?? 0} leads salvos)? Os leads encontrados
            por esta prospecção, conversas, mensagens, opt-outs e vínculos de
            campanha também serão{" "}
            <strong className="text-red-600">removidos permanentemente</strong>.
            Digite <strong className="text-zinc-900">EXCLUIR</strong> para
            confirmar.
          </span>
        }
      />
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
      <span className="text-zinc-400">{icon}</span>
      <div>
        <div className="text-sm font-semibold text-zinc-800">{value}</div>
        <div className="text-[11px] text-zinc-500">{label}</div>
      </div>
    </div>
  );
}
