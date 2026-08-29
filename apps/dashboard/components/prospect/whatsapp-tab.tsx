"use client";

/**
 * Aba "WhatsApp" da Prospecção — extração de contatos de grupos do WhatsApp.
 *
 * Fluxo: lista grupos da sessão Baileys da empresa (mesmo número logado em
 * Configurações) → usuário marca os grupos, ajusta opções e escolhe o destino
 * → confirma o checkbox de responsabilidade legal → extrai (fila BullMQ).
 *
 * Salvaguardas implementadas AQUI e no backend:
 *  - A extração NUNCA envia mensagens (a campanha alvo, se escolhida, fica
 *    PAUSED até revisão manual).
 *  - O checkbox "responsabilidade legal" é obrigatório (o servidor também
 *    rejeita requisições sem `confirmLegal: true`).
 *  - Ação restrita a OWNER/BUSINESS_ADMIN (backend valida papel de novo).
 *  - Feature de plano `whatsapp_group_extraction` (plano Empresa).
 *
 * "Limpar leads": apaga os leads criados pela extração selecionada
 * (confirmação reforçada na UI). Leads pré-existentes da base são apenas
 * desvinculados — o backend valida isso de novo.
 */
import { useEffect, useMemo, useState } from "react";
import {
  MessageCircle,
  Lock,
  RefreshCw,
  Users,
  Phone,
  Sparkles,
  Building2,
  ExternalLink,
  Loader2,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { Button, Spinner } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { useApi, request } from "@/hooks/use-api";
import { useRealtime } from "@/hooks/use-realtime";
import { useSession, isBusinessOwnerOrAdmin } from "@/hooks/use-session";
import { useQueryClient } from "@tanstack/react-query";

interface WaStatus {
  connected: boolean;
  state: string;
  qrAvailable: boolean;
  loggedIn: boolean;
  phone: string | null;
}

/** Grupo do WhatsApp como retornado pelo worker (proxy da API). */
interface WhatsAppGroup {
  jid: string;
  subject: string;
  size: number | null;
}

interface ExtractionSource {
  group_name: string;
  group_identifier: string;
  participant_count: number | null;
}

interface Extraction {
  id: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  found_count: number;
  unique_count: number;
  duplicate_count: number;
  phone_count: number;
  enriched_count: number;
  qualified_count: number;
  error_message: string | null;
  campaign: { id: string; name: string; status: string } | null;
  sources: ExtractionSource[];
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface ExtractionLead {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  isAdmin: boolean;
  group_name: string;
}

const ACTIVE_STATUSES = ["PENDING", "RUNNING"];

const STATUS_TONE: Record<string, "zinc" | "amber" | "emerald" | "blue" | "red"> = {
  PENDING: "amber",
  RUNNING: "blue",
  COMPLETED: "emerald",
  FAILED: "red",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendente",
  RUNNING: "Em andamento",
  COMPLETED: "Concluída",
  FAILED: "Falhou",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function WhatsAppTab() {
  const { success, error: toastError } = useToast();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const canExtract = isBusinessOwnerOrAdmin(user?.businessRole);

  const business = useApi<{
    plan:
      | { slug: string | null; name: string | null; features: Record<string, boolean> }
      | null;
  }>(["business-settings"], "business/settings");
  const isPlatformAdmin = user?.platform_role === "PLATFORM_ADMIN";
  const featureEnabled =
    isPlatformAdmin ||
    Boolean(business.data?.plan?.features?.whatsapp_group_extraction);
  const planLoading = business.isLoading;

  const wa = useApi<WaStatus>(["whatsapp-status"], "whatsapp/status", {
    refetchInterval: 5000,
  });

  const {
    data: groups = [],
    isLoading: groupsLoading,
    refetch: refetchGroups,
    error: groupsError,
  } = useApi<WhatsAppGroup[]>(["whatsapp-groups"], "whatsapp/groups/list", {
    enabled: featureEnabled && Boolean(wa.data?.connected),
    retry: false,
  });

  const {
    data: extractions = [],
    isLoading: extractionsLoading,
    refetch: refetchExtractions,
  } = useApi<Extraction[]>(["whatsapp-group-extractions"], "whatsapp/groups/extractions", {
    refetchInterval: 5000,
  });

  // Realtime: quando o worker publica progresso da extração, atualiza a lista
  // (contadores) — mesmo fluxo da prospecção web.
  useRealtime({
    whatsapp_group_progress: (_event) => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-group-extractions"] });
    },
  });

  const [selected, setSelected] = useState<string[]>([]);
  const [excludeAdmins, setExcludeAdmins] = useState(false);
  const [ignoreOwnContact, setIgnoreOwnContact] = useState(true);
  const [removeDuplicates, setRemoveDuplicates] = useState(true);
  const [autoEnrich, setAutoEnrich] = useState(false);
  const [destination, setDestination] = useState<"leads" | "enrich" | "campaign">(
    "leads",
  );
  const [confirmLegal, setConfirmLegal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedExtractionId, setSelectedExtractionId] = useState<string | null>(
    null,
  );
  const [exportingCampaign, setExportingCampaign] = useState(false);
  const [clearLeadsOpen, setClearLeadsOpen] = useState(false);
  const [clearingLeads, setClearingLeads] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Extraction | null>(null);
  const [deletingExtraction, setDeletingExtraction] = useState(false);

  const activeExtraction = useMemo(
    () => extractions.find((e) => ACTIVE_STATUSES.includes(e.status)),
    [extractions],
  );

  const selectedExtraction =
    extractions.find((e) => e.id === selectedExtractionId) ?? null;

  const canClearLeads =
    canExtract &&
    Boolean(selectedExtraction) &&
    ["COMPLETED"].includes(selectedExtraction?.status ?? "");

  const {
    data: leadsData,
    isLoading: leadsLoading,
  } = useApi<{ extractionId: string; total: number; leads: ExtractionLead[] }>(
    ["whatsapp-groups-leads", selectedExtractionId ?? ""],
    `/whatsapp/groups/extractions/${selectedExtractionId}/leads`,
    {
      enabled:
        Boolean(selectedExtractionId) &&
        Boolean(selectedExtraction) &&
        ["COMPLETED", "RUNNING"].includes(selectedExtraction?.status ?? ""),
      refetchInterval: 5000,
    },
  );

  // Mantém a seleção de uma extração válida quando a lista muda.
  useEffect(() => {
    if (extractions.length === 0) {
      setSelectedExtractionId(null);
      return;
    }
    if (!selectedExtractionId || !extractions.some((e) => e.id === selectedExtractionId)) {
      setSelectedExtractionId(extractions[0].id);
    }
  }, [extractions, selectedExtractionId]);

  function toggleGroup(jid: string) {
    setSelected((prev) =>
      prev.includes(jid) ? prev.filter((j) => j !== jid) : [...prev, jid],
    );
  }

  async function extract() {
    if (selected.length === 0) {
      toastError("Selecione ao menos um grupo do WhatsApp para extrair.");
      return;
    }
    if (!confirmLegal) {
      toastError(
        "Você precisa confirmar o checkbox de responsabilidade legal para extrair contatos.",
      );
      return;
    }
    setSubmitting(true);
    try {
      await request("whatsapp/groups/extract", {
        method: "POST",
        body: {
          groupIds: selected,
          confirmLegal: true,
          options: {
            removeDuplicates,
            ignoreOwnContact,
            excludeAdmins,
            autoEnrich,
          },
          destination,
        },
      });
      success(
        "Extração iniciada. Os contatos viram leads para revisão — nenhuma mensagem é enviada automaticamente.",
      );
      setSelected([]);
      const active = extractions.find((e) => ACTIVE_STATUSES.includes(e.status));
      if (active) setSelectedExtractionId(active.id);
      queryClient.invalidateQueries({ queryKey: ["whatsapp-group-extractions"] });
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Falha ao iniciar extração.");
    } finally {
      setSubmitting(false);
    }
  }

  async function exportToCampaign() {
    if (!selectedExtraction) return;
    setExportingCampaign(true);
    try {
      const res = await request<{
        campaignId: string;
        campaignName: string;
        campaignStatus: string;
        total: number;
        linkedNew: number;
      }>(
        `whatsapp/groups/extractions/${selectedExtraction.id}/export-to-campaign`,
        { method: "POST", body: {} },
      );
      success(
        res.linkedNew > 0
          ? `${res.linkedNew} lead(s) vinculado(s) à campanha "${res.campaignName}". A campanha está PAUSED — revise e ative antes de qualquer envio.`
          : `Os leads já estavam vinculados à campanha "${res.campaignName}". Nenhum novo vínculo criado.`,
      );
      queryClient.invalidateQueries({ queryKey: ["whatsapp-group-extractions"] });
    } catch (err) {
      toastError(
        err instanceof Error ? err.message : "Falha ao vincular leads à campanha.",
      );
    } finally {
      setExportingCampaign(false);
    }
  }

  async function clearLeads() {
    if (!selectedExtraction) return;
    setClearingLeads(true);
    try {
      const res = await request<{ leads_deleted: number; unlinked: number }>(
        `whatsapp/groups/extractions/${selectedExtraction.id}/leads`,
        { method: "DELETE", body: {} },
      );
      if (res.leads_deleted > 0 && res.unlinked > 0) {
        success(
          `${res.leads_deleted} lead(s) criado(s) por esta extração excluído(s). ${res.unlinked} lead(s) pré-existente(s) apenas desvinculado(s).`,
        );
      } else if (res.leads_deleted > 0) {
        success(
          `${res.leads_deleted} lead(s) criado(s) por esta extração excluído(s).`,
        );
      } else {
        success(
          `${res.unlinked} lead(s) desvinculado(s) da extração (já existiam na base e foram mantidos).`,
        );
      }
      setClearLeadsOpen(false);
      queryClient.invalidateQueries({ queryKey: ["whatsapp-groups-leads"] });
    } catch (err) {
      toastError(
        err instanceof Error ? err.message : "Falha ao limpar leads da extração.",
      );
    } finally {
      setClearingLeads(false);
    }
  }

  async function deleteExtraction() {
    if (!deleteTarget) return;
    setDeletingExtraction(true);
    try {
      const res = await request<{ leads_deleted: number; unlinked: number }>(
        `whatsapp/groups/extractions/${deleteTarget.id}`,
        { method: "DELETE", body: {} },
      );
      if (res.leads_deleted > 0 && res.unlinked > 0) {
        success(
          `Extração excluída. ${res.leads_deleted} lead(s) criado(s) por ela também foram excluído(s); ${res.unlinked} lead(s) pré-existente(s) apenas desvinculado(s).`,
        );
      } else if (res.leads_deleted > 0) {
        success(
          `Extração excluída junto com ${res.leads_deleted} lead(s) criado(s) por ela.`,
        );
      } else {
        success("Extração excluída.");
      }
      if (selectedExtractionId === deleteTarget.id) {
        setSelectedExtractionId(null);
      }
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["whatsapp-group-extractions"] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-groups-leads"] });
    } catch (err) {
      toastError(
        err instanceof Error ? err.message : "Falha ao excluir a extração.",
      );
    } finally {
      setDeletingExtraction(false);
    }
  }

  if (planLoading || !business.data) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }

  if (!featureEnabled) {
    return (
      <Card>
        <CardHeader title="WhatsApp" subtitle="Extração de contatos de grupos" />
        <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
          <Lock className="h-8 w-8 text-zinc-300" />
          <p className="max-w-md text-sm text-zinc-600">
            A extração de contatos de grupos do WhatsApp está disponível apenas
            no plano <strong>Empresa</strong>. Faça upgrade do seu plano para
            usar este recurso.
          </p>
          <Link href="/payment">
            <Button>Fazer upgrade</Button>
          </Link>
        </div>
      </Card>
    );
  }

  const connected = Boolean(wa.data?.connected);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Extrair contatos de grupos"
          subtitle="Use a MESMA conexão WhatsApp já configurada na sua empresa (Configurações). Extraímos nome e telefone dos participantes do grupo selecionado."
          action={
            <Badge tone={connected ? "emerald" : "amber"}>
              {connected
                ? `WhatsApp conectado${wa.data?.phone ? ` (${wa.data.phone})` : ""}`
                : "WhatsApp desconectado"}
            </Badge>
          }
        />
        {!connected ? (
          <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
            <MessageCircle className="h-8 w-8 text-zinc-300" />
            <p className="max-w-md text-sm text-zinc-600">
              Para extrair contatos de grupos, a empresa precisa estar com o
              WhatsApp conectado. Conecte em{" "}
              <Link href="/settings" className="font-medium text-indigo-600 hover:underline">
                Configurações
              </Link>
              . A extração usa o mesmo número logado — sem conexão paralela.
            </p>
            <Link href="/settings">
              <Button>Ir para Configurações</Button>
            </Link>
          </div>
        ) : groupsLoading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : groupsError || groups.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
            <Users className="h-8 w-8 text-zinc-300" />
            <p className="max-w-md text-sm text-zinc-600">
              {groupsError
                ? groupsError instanceof Error
                  ? groupsError.message
                  : "Não foi possível listar os grupos."
                : "Nenhum grupo encontrado nesta conta WhatsApp. Participe de grupos pelo celular e atualize a lista."}
            </p>
            <Button variant="outline" onClick={() => void refetchGroups()}>
              <RefreshCw className="h-4 w-4" /> Atualizar grupos
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {!canExtract ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Apenas <strong>OWNER</strong> ou <strong>Business Admin</strong>{" "}
                podem iniciar extrações.
              </div>
            ) : null}

            <div className="grid max-h-72 grid-cols-1 gap-2 overflow-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
              {groups.map((g) => {
                const checked = selected.includes(g.jid);
                return (
                  <button
                    key={g.jid}
                    type="button"
                    disabled={!canExtract}
                    onClick={() => toggleGroup(g.jid)}
                    className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-all ${
                      checked
                        ? "border-[#6366F1] bg-[#6366F1]/5 shadow-sm"
                        : "border-[#E6E8F0] bg-white hover:border-[#C7CBE0] hover:bg-slate-50"
                    } ${canExtract ? "cursor-pointer" : "cursor-not-allowed opacity-70"}`}
                  >
                    <span
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        checked
                          ? "border-[#6366F1] bg-[#6366F1]"
                          : "border-[#CBD2E0] bg-white"
                      }`}
                    >
                      {checked ? (
                        <span className="block h-2 w-2 rounded-sm bg-white" />
                      ) : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-[#0F172A]">
                        {g.subject}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500">
                        <Users className="h-3 w-3" />
                        {g.size != null ? `${g.size} participantes` : "Participantes"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Toggle
                label="Remover duplicados"
                hint="Um contato vale uma vez"
                checked={removeDuplicates}
                onChange={setRemoveDuplicates}
                disabled={!canExtract}
              />
              <Toggle
                label="Ignorar meu contato"
                hint="Não salvar o número logado"
                checked={ignoreOwnContact}
                onChange={setIgnoreOwnContact}
                disabled={!canExtract}
              />
              <Toggle
                label="Excluir admins"
                hint="Administradores dos grupos"
                checked={excludeAdmins}
                onChange={setExcludeAdmins}
                disabled={!canExtract}
              />
              <Toggle
                label="Enriquecer automaticamente"
                hint="Buscar mais dados (poucos terão site)"
                checked={autoEnrich}
                onChange={setAutoEnrich}
                disabled={!canExtract}
              />
            </div>

            <div>
              <label className="label">Para onde vão os contatos?</label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <DestinationOption
                  active={destination === "leads"}
                  onClick={() => setDestination("leads")}
                  icon={<Users className="h-4 w-4" />}
                  title="Apenas leads"
                  hint="Salva os contatos como leads (origem WhatsApp) para revisão posterior."
                  disabled={!canExtract}
                />
                <DestinationOption
                  active={destination === "enrich"}
                  onClick={() => setDestination("enrich")}
                  icon={<Sparkles className="h-4 w-4" />}
                  title="Leads + enriquecimento"
                  hint="Salva e enfileira enriquecimento (site/redes) quando houver dados públicos."
                  disabled={!canExtract}
                />
                <DestinationOption
                  active={destination === "campaign"}
                  onClick={() => setDestination("campaign")}
                  icon={<Building2 className="h-4 w-4" />}
                  title="Vincular em campanha"
                  hint="Associa aos leads à campanha da empresa. A campanha fica PAUSED até você revisar e ativar."
                  disabled={!canExtract}
                />
              </div>
            </div>

            <label className="flex items-start gap-3 rounded-xl border border-[#F0C6C6] bg-red-50/60 p-4">
              <input
                type="checkbox"
                checked={confirmLegal}
                onChange={(e) => setConfirmLegal(e.target.checked)}
                disabled={!canExtract}
                className="mt-0.5 h-4 w-4 accent-[#6366F1]"
              />
              <span className="text-xs leading-relaxed text-[#7F1D1D]">
                <ShieldAlert className="mr-1 inline h-4 w-4 align-text-bottom" />
                Confirmo que sou responsável pelo uso desta funcionalidade e
                estou ciente de que a extração respeita os Termos do WhatsApp e
                a LGPD. Contatos viram leads somente para a empresa titular;
                opt-outs são respeitados no envio e nenhuma mensagem é enviada
                automaticamente por esta extração.
              </span>
            </label>

            <Button
              onClick={() => void extract()}
              disabled={
                !canExtract || submitting || !confirmLegal || selected.length === 0 || Boolean(activeExtraction)
              }
              size="lg"
              className="w-full"
            >
              {submitting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Users className="h-5 w-5" />
              )}
              {activeExtraction && !submitting
                ? "Já existe uma extração em andamento"
                : `EXTRAIR CONTATOS ${selected.length > 0 ? `(${selected.length} grupo${selected.length > 1 ? "s" : ""})` : ""}`}
            </Button>
            <p className="text-xs text-zinc-500">
              A extração roda em segundo plano (fila BullMQ) e nunca envia
              mensagens. Acompanhe o progresso abaixo.
            </p>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Extrações"
          subtitle="Histórico de extrações de contatos de grupos desta empresa"
          action={
            <Button variant="ghost" size="sm" onClick={() => void refetchExtractions()}>
              <RefreshCw className="h-3.5 w-3.5" /> Atualizar
            </Button>
          }
        />
        {extractionsLoading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : extractions.length === 0 ? (
          <div className="py-10 text-center text-sm text-zinc-500">
            <Sparkles className="mx-auto mb-2 h-8 w-8 text-zinc-300" />
            Nenhuma extração ainda. Selecione grupos acima para começar.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Grupos</th>
                  <th className="px-4 py-3">Encontrados</th>
                  <th className="px-4 py-3">Novos</th>
                  <th className="px-4 py-3">Duplicados</th>
                  <th className="px-4 py-3">C/ telefone</th>
                  <th className="px-4 py-3">Destino</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {extractions.map((ext) => (
                  <tr
                    key={ext.id}
                    onClick={() => setSelectedExtractionId(ext.id)}
                    className={`cursor-pointer border-t border-zinc-200 hover:bg-zinc-100/60 ${selectedExtractionId === ext.id ? "bg-emerald-50/60" : ""}`}
                  >
                    <td className="px-4 py-2.5 whitespace-nowrap text-zinc-500">
                      {formatDate(ext.created_at)}
                    </td>
                    <td className="max-w-[200px] px-4 py-2.5">
                      <span className="block truncate font-medium text-zinc-800">
                        {ext.sources?.[0]?.group_name ?? "—"}
                      </span>
                      {ext.sources && ext.sources.length > 1 ? (
                        <span className="text-[11px] text-zinc-400">
                          +{ext.sources.length - 1} outros
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-600">
                      {ext.found_count}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-emerald-700">
                      {ext.unique_count}
                    </td>
                    <td className="px-4 py-2.5 text-amber-600">
                      {ext.duplicate_count}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-600">
                      {ext.phone_count}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-500">
                      {ext.campaign ? `Campanha (${ext.campaign.status})` : "Leads"}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={STATUS_TONE[ext.status] as "zinc"}>
                        {STATUS_LABEL[ext.status]}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedExtractionId(ext.id);
                          }}
                        >
                          <ExternalLink className="h-3.5 w-3.5" /> Ver
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600"
                          disabled={ACTIVE_STATUSES.includes(ext.status)}
                          title={
                            ACTIVE_STATUSES.includes(ext.status)
                              ? "Aguarde a extração terminar para excluir."
                              : "Exclui esta extração e os leads criados por ela (leads pré-existentes da base são apenas desvinculados)."
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(ext);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Excluir
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

      {selectedExtraction ? (
        <Card>
          <CardHeader
            title="Leads extraídos"
            subtitle={
              selectedExtraction.sources?.length
                ? selectedExtraction.sources.map((s) => s.group_name).join(", ")
                : "Participantes convertidos em leads"
            }
            action={
              <div className="flex flex-wrap items-center gap-3 text-sm">
                {selectedExtraction.status === "FAILED" &&
                selectedExtraction.error_message ? (
                  <Badge tone="red">Falhou</Badge>
                ) : (
                  <>
                    {selectedExtraction.status === "COMPLETED" &&
                    selectedExtraction.campaign ? (
                      <Badge tone="emerald">
                        Vinculada:{" "}
                        {selectedExtraction.campaign.status === "PAUSED"
                          ? "Campanha PAUSED"
                          : selectedExtraction.campaign.name}
                      </Badge>
                    ) : null}
                    {selectedExtraction.status === "COMPLETED" &&
                    !selectedExtraction.campaign ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={
                          exportingCampaign || !leadsData || leadsData.total === 0
                        }
                        onClick={() => void exportToCampaign()}
                        title="Exporta os leads desta extração para a campanha da empresa (nasce/fica PAUSED — nenhuma mensagem é enviada automaticamente)."
                      >
                        {exportingCampaign ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Building2 className="h-3.5 w-3.5" />
                        )}
                        Exportar para campanha
                      </Button>
                    ) : null}
                    <span className="inline-flex items-center gap-1 text-[#16A34A]">
                      <Phone className="h-3.5 w-3.5" />
                      {selectedExtraction.phone_count}
                    </span>
                    <Badge tone={STATUS_TONE[selectedExtraction.status] as "zinc"}>
                      {STATUS_LABEL[selectedExtraction.status]}
                    </Badge>
                  </>
                )}
                {canClearLeads ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600"
                    disabled={
                      clearingLeads || !leadsData || leadsData.total === 0
                    }
                    onClick={() => setClearLeadsOpen(true)}
                    title="Apaga os leads criados por esta extração. Leads que já existiam na base são apenas desvinculados."
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Limpar leads
                  </Button>
                ) : null}
              </div>
            }
          />
          <div className="max-h-[440px] overflow-auto">
            {selectedExtraction.status === "FAILED" &&
            selectedExtraction.error_message ? (
              <div className="m-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <strong className="font-semibold">A extração falhou:</strong>{" "}
                {selectedExtraction.error_message}
              </div>
            ) : null}
            {leadsLoading ? (
              <div className="flex justify-center py-10">
                <Spinner />
              </div>
            ) : !leadsData || leadsData.total === 0 ? (
              <div className="py-10 text-center text-sm text-zinc-500">
                <Users className="mx-auto mb-2 h-8 w-8 text-zinc-300" />
                {["PENDING", "RUNNING"].includes(selectedExtraction.status)
                  ? "A extração ainda está em andamento. Os leads aparecem aqui em tempo real."
                  : "Nenhum lead com contato foi salvo nesta extração."}
              </div>
            ) : (
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="sticky top-0 bg-zinc-50 text-[11px] uppercase tracking-wider text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">Nome</th>
                    <th className="px-4 py-3">Telefone</th>
                    <th className="px-4 py-3">Grupo</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {leadsData.leads.map((lead) => (
                    <tr key={lead.id} className="border-t border-zinc-200 hover:bg-zinc-100/60">
                      <td className="max-w-[240px] px-4 py-2.5 font-medium text-zinc-800">
                        <span className="block truncate">
                          {lead.name || "Sem nome"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-zinc-600">
                        {lead.phone ? (
                          <a href={`tel:${lead.phone}`} className="hover:text-emerald-600">
                            {lead.phone}
                          </a>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>
                      <td className="max-w-[200px] px-4 py-2.5 text-zinc-500">
                        <span className="block truncate">{lead.group_name}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        {lead.isAdmin ? (
                          <Badge tone="amber">Admin</Badge>
                        ) : (
                          <Badge tone="zinc">Participante</Badge>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-zinc-500">{lead.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      ) : null}

      <ConfirmModal
        open={clearLeadsOpen}
        title="Limpar leads desta extração"
        confirmText="EXCLUIR"
        confirmLabel="Limpar leads"
        loading={clearingLeads}
        onCancel={() => setClearLeadsOpen(false)}
        onConfirm={() => void clearLeads()}
        message={
          <span>
            Você está prestes a excluir{" "}
            <strong className="text-red-600">
              {leadsData?.total ?? 0} lead(s)
            </strong>{" "}
            dessa extração de{" "}
            <strong className="text-zinc-900">
              {selectedExtraction?.sources?.[0]?.group_name ?? "grupos do WhatsApp"}
            </strong>
            . Conversas, mensagens, opt-outs e gerações de IA vinculados também
            serão removidos. Leads que já existiam na base são apenas
            desvinculados (mantidos em Clientes). Digite{" "}
            <strong className="text-zinc-900">EXCLUIR</strong> para confirmar.
            Esta ação não pode ser desfeita.
          </span>
        }
      />

      <ConfirmModal
        open={deleteTarget !== null}
        title="Excluir extração"
        confirmText="EXCLUIR"
        confirmLabel="Excluir extração"
        loading={deletingExtraction}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void deleteExtraction()}
        message={
          <span>
            Você está prestes a excluir a extração do dia{" "}
            <strong className="text-zinc-900">
              {deleteTarget ? formatDate(deleteTarget.created_at) : ""}
            </strong>{" "}
            ({deleteTarget?.sources?.[0]?.group_name ?? "grupos do WhatsApp"}).
            Os{" "}
            <strong className="text-red-600">
              {deleteTarget?.phone_count ?? 0}
            </strong>{" "}
            lead(s) salvos por ela e todo o histórico (mensagens, conversas,
            opt-outs e gerações de IA) também serão excluídos. Leads que já
            existiam na base são apenas desvinculados (mantidos em Clientes).
            Digite{" "}
            <strong className="text-zinc-900">EXCLUIR</strong> para confirmar.
            Esta ação não pode ser desfeita.
          </span>
        }
      />
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-all ${
        checked
          ? "border-[#6366F1] bg-[#6366F1]/5"
          : "border-[#E6E8F0] bg-white hover:border-[#C7CBE0]"
      } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
    >
      <span
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded ${checked ? "bg-[#6366F1]" : "border border-[#CBD2E0] bg-white"}`}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-[#0F172A]">{label}</span>
        {hint ? <span className="block text-[11px] text-zinc-500">{hint}</span> : null}
      </span>
    </button>
  );
}

function DestinationOption({
  active,
  onClick,
  icon,
  title,
  hint,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  hint: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-all ${
        active
          ? "border-[#6366F1] bg-[#6366F1]/5 shadow-sm"
          : "border-[#E6E8F0] bg-white hover:border-[#C7CBE0]"
      } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
    >
      <span className={`mt-0.5 ${active ? "text-[#6366F1]" : "text-zinc-400"}`}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-[#0F172A]">{title}</span>
        <span className="block text-[11px] leading-relaxed text-zinc-500">{hint}</span>
      </span>
    </button>
  );
}