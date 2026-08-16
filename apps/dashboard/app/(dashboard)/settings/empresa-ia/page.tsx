"use client";

import { useState, useEffect } from "react";
import {
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Building2,
} from "lucide-react";
import { DashboardShell } from "@/components/layout/shell";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useApi, request } from "@/hooks/use-api";
import { useQueryClient } from "@tanstack/react-query";

const SEGMENTS = [
  "Barbearia",
  "Salão de beleza",
  "Clínica",
  "Restaurante",
  "Imobiliária",
  "Loja",
  "Oficina",
  "Agência",
  "Prestador de serviços",
  "E-commerce",
  "Consultoria",
  "Outro",
];

interface BusinessSettings {
  name: string | null;
  segment: string | null;
  email: string | null;
  phone: string | null;
  description: string | null;
  website: string | null;
  instagram: string | null;
  opening_hours: string | null;
  address: string | null;
}

interface AiConfigStatus {
  configured: boolean;
  lastAppliedAt: string | null;
}

/**
 * Tela unificada "Empresa + IA" (substitui "Meu negócio" + "Configurar IA").
 *
 * Contratos confirmados:
 * - GET  /business/settings            → dados da empresa (name, segment, ...)
 * - GET  /business/ai-config-status    → { configured, lastAppliedAt }
 * - POST /business/apply-ai-config     → { applied, lastAppliedAt }
 * O JSON estruturado gerado pela IA é salvo no backend e nunca retornado ao
 * usuário — a tela só exibe confirmação + timestamp.
 */
export default function EmpresaIaPage() {
  const { success, error: toastError } = useToast();
  const queryClient = useQueryClient();

  const business = useApi<BusinessSettings>(
    ["business-settings"],
    "business/settings",
  );
  const settings = business.data;

  const aiStatus = useApi<AiConfigStatus>(
    ["ai-config-status"],
    "business/ai-config-status",
    { refetchInterval: 30000 },
  );

  const [form, setForm] = useState<Record<string, string>>({});
  const [showDetails, setShowDetails] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const setField = (key: string, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setApplyError(null);
  };

  const fieldValue = (key: string, fallback: string | null | undefined) => {
    if (form[key] !== undefined) return form[key];
    return fallback ?? "";
  };

  // Preenche o formulário a partir dos dados já salvos quando carregam.
  useEffect(() => {
    if (!settings) return;
    setForm((f) => {
      const next = { ...f };
      const map: Array<[string, string | null | undefined]> = [
        ["name", settings.name],
        ["segment", settings.segment],
        ["email", settings.email],
        ["phone", settings.phone],
        ["description", settings.description],
        ["site", settings.website],
        ["instagram", settings.instagram],
        ["horario", settings.opening_hours],
        ["localizacao", settings.address],
      ];
      for (const [key, value] of map) {
        if (next[key] === undefined && value != null) next[key] = value;
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const apply = async () => {
    setApplyError(null);
    const name = (form.name ?? settings?.name ?? "").trim();
    const segment = (form.segment ?? settings?.segment ?? "").trim();

    if (!name) {
      setApplyError(
        "Informe o nome da empresa para aplicar as informações na IA.",
      );
      return;
    }
    if (!segment) {
      setApplyError(
        "Selecione o segmento da empresa para aplicar as informações na IA.",
      );
      return;
    }

    setApplying(true);
    try {
      await request("business/apply-ai-config", {
        method: "POST",
        body: {
          name,
          segment,
          email: (form.email ?? settings?.email ?? "").trim(),
          phone: (form.phone ?? settings?.phone ?? "").trim(),
          description: (form.description ?? settings?.description ?? "").trim(),
          site: (form.site ?? settings?.website ?? "").trim(),
          instagram: (form.instagram ?? settings?.instagram ?? "").trim(),
          horario: (form.horario ?? settings?.opening_hours ?? "").trim(),
          localizacao: (form.localizacao ?? settings?.address ?? "").trim(),
        },
      });
      success("Informações aplicadas com sucesso à IA.");
      queryClient.invalidateQueries({ queryKey: ["ai-config-status"] });
      queryClient.invalidateQueries({ queryKey: ["business-settings"] });
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : "Falha ao aplicar as informações na IA. Tente novamente.";
      setApplyError(msg);
      toastError(msg);
    } finally {
      setApplying(false);
    }
  };

  const formattedLastApplied = aiStatus.data?.lastAppliedAt
    ? new Date(aiStatus.data.lastAppliedAt).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const isLoading = business.isLoading;

  return (
    <DashboardShell title="Configuração da IA">
      <div className="mb-6">
        <h1 className="heading-strong text-xl">Configuração da IA</h1>
        <p className="text-sm text-zinc-500">
          Dados da sua empresa aplicados automaticamente ao agente de
          atendimento.
        </p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader
            title="Dados da empresa"
            subtitle="Informações usadas pela IA para personalizar o atendimento"
          />
          <div className="space-y-4 p-5">
            <Input
              label="Nome da empresa"
              value={fieldValue("name", settings?.name)}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="Ex.: Barbearia Central"
              disabled={isLoading}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">
                  Segmento
                </label>
                <select
                  value={fieldValue("segment", settings?.segment)}
                  onChange={(e) => setField("segment", e.target.value)}
                  disabled={isLoading}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-emerald-500/60"
                >
                  <option value="">Selecione...</option>
                  {SEGMENTS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <Input
                label="Telefone"
                value={fieldValue("phone", settings?.phone)}
                onChange={(e) => setField("phone", e.target.value)}
                placeholder="(11) 99999-0000"
                disabled={isLoading}
              />
            </div>
            <Input
              label="E-mail"
              type="email"
              value={fieldValue("email", settings?.email)}
              onChange={(e) => setField("email", e.target.value)}
              placeholder="contato@empresa.com"
              disabled={isLoading}
            />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-700">
                Descrição da empresa
              </label>
              <textarea
                value={fieldValue("description", settings?.description)}
                onChange={(e) => setField("description", e.target.value)}
                disabled={isLoading}
                rows={3}
                placeholder="Descreva o que sua empresa faz, os produtos ou serviços oferecidos..."
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-emerald-500/60"
              />
            </div>
          </div>
        </Card>

        <Card>
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="flex w-full items-center justify-between gap-3 px-5 pt-5 text-left"
            aria-expanded={showDetails}
          >
            <div>
              <h3 className="font-bold text-foreground">Mais detalhes</h3>
              <p className="mt-0.5 text-xs text-zinc-500">
                Opcional — deixe a IA ainda mais precisa sobre seu negócio
              </p>
            </div>
            {showDetails ? (
              <ChevronUp className="h-5 w-5 text-zinc-400" />
            ) : (
              <ChevronDown className="h-5 w-5 text-zinc-400" />
            )}
          </button>
          {showDetails ? (
            <div className="space-y-4 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Site"
                  value={fieldValue("site", settings?.website)}
                  onChange={(e) => setField("site", e.target.value)}
                  placeholder="https://..."
                  disabled={isLoading}
                />
                <Input
                  label="Instagram"
                  value={fieldValue("instagram", settings?.instagram)}
                  onChange={(e) => setField("instagram", e.target.value)}
                  placeholder="@suaempresa"
                  disabled={isLoading}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Horário de atendimento"
                  value={fieldValue("horario", settings?.opening_hours)}
                  onChange={(e) => setField("horario", e.target.value)}
                  placeholder="Seg a Sex 9h–18h, Sáb 9h–13h"
                  disabled={isLoading}
                />
                <Input
                  label="Localização"
                  value={fieldValue("localizacao", settings?.address)}
                  onChange={(e) => setField("localizacao", e.target.value)}
                  placeholder="Rua, número, bairro, cidade..."
                  disabled={isLoading}
                />
              </div>
            </div>
          ) : null}
        </Card>

        <Card>
          <div className="flex flex-col gap-4">
            {applyError ? (
              <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{applyError}</span>
              </div>
            ) : null}

            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-sm">
                {aiStatus.data?.configured ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                    <span className="font-medium text-emerald-600">
                      IA configurada
                    </span>
                    {formattedLastApplied ? (
                      <span className="text-zinc-500">
                        · Última atualização: {formattedLastApplied}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className="flex items-center gap-2 text-zinc-500">
                    <Building2 className="h-4 w-4 shrink-0 text-zinc-400" />
                    IA ainda não configurada
                  </span>
                )}
              </div>

              <Button
                onClick={() => void apply()}
                loading={applying}
                className="w-full sm:w-auto"
              >
                <Sparkles className="mr-2 h-4 w-4" />
                {aiStatus.data?.configured
                  ? "Atualizar configuração da IA"
                  : "Aplicar informações na IA"}
              </Button>
            </div>

            <p className="text-[11px] text-zinc-500">
              Ao aplicar, os dados acima são enviados para a IA do seu
              atendimento. Reenviar o formulário apenas atualiza a configuração
              — não cria nada novo.
            </p>
          </div>
        </Card>
      </div>
    </DashboardShell>
  );
}
