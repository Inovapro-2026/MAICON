"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Building2,
  BookOpen,
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
  target_audience: string | null;
  problems_solved: string | null;
  differentials: string | null;
  positioning: string | null;
  service_area: string | null;
  business_objectives: string | null;
  additional_instructions: string | null;
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
        ["publico", settings.target_audience],
        ["problemas", settings.problems_solved],
        ["diferenciais", settings.differentials],
        ["posicionamento", settings.positioning],
        ["area_atendimento", settings.service_area],
        ["objetivo", settings.business_objectives],
        ["instrucoes", settings.additional_instructions],
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
          publico: (form.publico ?? settings?.target_audience ?? "").trim(),
          problemas: (form.problemas ?? settings?.problems_solved ?? "").trim(),
          diferenciais: (form.diferenciais ?? settings?.differentials ?? "").trim(),
          posicionamento: (form.posicionamento ?? settings?.positioning ?? "").trim(),
          area_atendimento: (form.area_atendimento ?? settings?.service_area ?? "").trim(),
          objetivo: (form.objetivo ?? settings?.business_objectives ?? "").trim(),
          instrucoes: (form.instrucoes ?? settings?.additional_instructions ?? "").trim(),
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
          Descreva sua empresa e o comportamento da IA em um único lugar — tudo é
          aplicado automaticamente ao agente de atendimento.
        </p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader
            title="Dados da empresa"
            subtitle="Campo único: informações da empresa + regras de comportamento da IA"
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
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <label className="block text-sm font-medium text-zinc-700">
                  Descrição da empresa/instrução de comportamento da IA
                </label>
                <Link
                  href="/ai/prompt-guide"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 transition-colors hover:bg-emerald-500/20"
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  Guia de prompts
                </Link>
              </div>
              <textarea
                value={fieldValue("description", settings?.description)}
                onChange={(e) => setField("description", e.target.value)}
                disabled={isLoading}
                maxLength={15000}
                rows={10}
                placeholder="Descreva sua empresa (o que faz, produtos ou serviços) e como a IA deve se comportar: tom de voz, postura e regras de atendimento. Use o modelo do Guia de prompts: descrição geral, posicionamento, principais recursos, principal objetivo e como a IA deve falar."
                className="w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-emerald-500/60"
              />
              <p className="mt-1 flex items-center justify-between gap-2 text-[11px] text-zinc-500">
                <span>
                  Campo único para dados da empresa + regras de comportamento da
                  IA (até 15.000 caracteres).
                </span>
                <span className="text-zinc-400">
                  {fieldValue("description", settings?.description).length} /{" "}
                  15000
                </span>
              </p>
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
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">
                  Público-alvo
                </label>
                <textarea
                  value={fieldValue("publico", settings?.target_audience)}
                  onChange={(e) => setField("publico", e.target.value)}
                  disabled={isLoading}
                  rows={2}
                  placeholder="Ex.: Pequenas e médias empresas, profissionais autônomos, lojas..."
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-emerald-500/60"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">
                  Problemas que a empresa resolve
                </label>
                <textarea
                  value={fieldValue("problemas", settings?.problems_solved)}
                  onChange={(e) => setField("problemas", e.target.value)}
                  disabled={isLoading}
                  rows={2}
                  placeholder="Ex.: Falta de novos leads, prospecção manual, baixa produtividade..."
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-emerald-500/60"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">
                  Diferenciais da empresa
                </label>
                <textarea
                  value={fieldValue("diferenciais", settings?.differentials)}
                  onChange={(e) => setField("diferenciais", e.target.value)}
                  disabled={isLoading}
                  rows={2}
                  placeholder="Ex.: Automação com IA, prospecção integrada, CRM, agentes inteligentes..."
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-emerald-500/60"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">
                  Posicionamento
                </label>
                <textarea
                  value={fieldValue("posicionamento", settings?.positioning)}
                  onChange={(e) => setField("posicionamento", e.target.value)}
                  disabled={isLoading}
                  rows={2}
                  placeholder="Ex.: Uma plataforma de inteligência comercial e automação de vendas, não apenas um CRM."
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-emerald-500/60"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Área de atendimento"
                  value={fieldValue("area_atendimento", settings?.service_area)}
                  onChange={(e) => setField("area_atendimento", e.target.value)}
                  placeholder="Ex.: Todo o Brasil, São Paulo, Online"
                  disabled={isLoading}
                />
                <Input
                  label="Objetivo principal"
                  value={fieldValue("objetivo", settings?.business_objectives)}
                  onChange={(e) => setField("objetivo", e.target.value)}
                  placeholder="Ex.: Gerar leads, vender produtos, agendar atendimentos"
                  disabled={isLoading}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">
                  Instruções adicionais para a IA
                </label>
                <textarea
                  value={fieldValue("instrucoes", settings?.additional_instructions)}
                  onChange={(e) => setField("instrucoes", e.target.value)}
                  disabled={isLoading}
                  maxLength={15000}
                  rows={6}
                  placeholder="Ex.: Sempre envie o link da vitrine quando o cliente demonstrar intenção de compra."
                  className="w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-emerald-500/60"
                />
                <p className="mt-1 text-right text-[11px] text-zinc-400">
                  {fieldValue("instrucoes", settings?.additional_instructions).length}{" "}
                  / 15000
                </p>
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
