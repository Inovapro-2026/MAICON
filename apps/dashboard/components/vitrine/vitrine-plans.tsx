"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import type { OnboardingPlan } from "@/lib/onboarding";
import { fetchPlans } from "@/lib/onboarding";

/** Slug do plano que recebe o selo de recomendação. */
const HIGHLIGHTED_PLAN_SLUG = "enterprise";

/** Tradução de apresentação das chaves de feature — a lista real vem da API. */
const FEATURE_LABELS: Record<string, string> = {
  max_users: "Usuários",
  max_contacts: "Contatos",
  max_conversations: "Conversas/mês",
  max_messages: "Mensagens/mês",
  max_agents: "Agentes de IA",
  max_whatsapp_connections: "Conexões WhatsApp",
  max_automations: "Automações",
  max_knowledge_items: "Itens na base de conhecimento",
  max_storage: "Armazenamento",
  max_ai_usage: "Uso de IA",
  prospeccao_web: "Prospecção web",
};

function featureLabel(key: string): string {
  return (
    FEATURE_LABELS[key] ??
    key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function formatLimit(limit: number | null): string {
  return limit !== null ? String(limit) : "Ilimitado";
}

function brl(price: number): string {
  return price.toFixed(2).replace(".", ",");
}

export function VitrinePlans() {
  const [plans, setPlans] = useState<OnboardingPlan[]>([]);

  useEffect(() => {
    void fetchPlans().then(setPlans);
  }, []);

  if (plans.length === 0) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500">
        Carregando planos disponíveis...
      </div>
    );
  }

  return (
    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
      {plans.map((plan) => {
        const highlighted = plan.slug === HIGHLIGHTED_PLAN_SLUG;
        return (
          <div
            key={plan.id}
            className={`relative flex flex-col rounded-2xl border bg-white p-6 ${
              highlighted
                ? "border-emerald-600 shadow-xl shadow-emerald-900/10"
                : "border-zinc-200 shadow-sm"
            }`}
          >
            {highlighted ? (
              <span className="absolute -top-3 left-6 rounded-full bg-emerald-600 px-3 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                Mais popular
              </span>
            ) : null}

            <div className="font-display text-lg font-bold text-zinc-900">
              {plan.name}
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-3xl font-black tracking-tight text-zinc-900">
                R$ {brl(plan.price)}
              </span>
              <span className="text-sm font-medium text-zinc-500">/mês</span>
            </div>
            {plan.description ? (
              <div className="mt-1.5 text-sm text-zinc-500">
                {plan.description}
              </div>
            ) : null}

            <div className="my-4 h-px bg-zinc-200" />

            <ul className="mb-6 flex-1 space-y-2">
              {plan.features.map((f) => {
                const limited = f.limit !== null;
                return (
                  <li
                    key={f.feature}
                    className={`flex items-center gap-2 text-sm ${
                      f.enabled ? "text-zinc-700" : "text-zinc-400 line-through"
                    }`}
                  >
                    <Check
                      className={`h-4 w-4 shrink-0 ${
                        f.enabled ? "text-emerald-600" : "text-zinc-400"
                      }`}
                      strokeWidth={3}
                    />
                    <span className="min-w-0 flex-1">
                      {featureLabel(f.feature)}
                    </span>
                    <span
                      className={`shrink-0 font-medium ${
                        limited ? "text-zinc-900" : "text-zinc-600"
                      }`}
                    >
                      {formatLimit(f.limit)}
                    </span>
                  </li>
                );
              })}
            </ul>

            <Link
              href="/signup"
              className={`inline-flex w-full items-center justify-center rounded-xl px-6 py-3 text-sm font-semibold transition-colors ${
                highlighted
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "border border-zinc-300 bg-white text-zinc-800 hover:border-emerald-600 hover:text-emerald-700"
              }`}
            >
              Escolher {plan.name}
            </Link>
          </div>
        );
      })}
    </div>
  );
}
