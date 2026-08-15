"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OnboardingPlan } from "@/lib/onboarding";

/** Slug do plano que recebe o selo de recomendação (decisão de negócio). */
const HIGHLIGHTED_PLAN_SLUG = "enterprise";

/**
 * Rótulos de exibição para as chaves de recurso do PlanFeature.
 * Apenas tradução de apresentação — a lista real de features/limites
 * vem da API (Plan/PlanFeature), nunca é hardcoded aqui.
 */
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

export function PlanStep({
  plans,
  selectedPlan,
  onSelect,
  onContinue,
  loading,
  error,
}: {
  plans: OnboardingPlan[];
  selectedPlan: string;
  onSelect: (id: string) => void;
  onContinue: () => void;
  loading: boolean;
  error?: string | null;
}) {
  if (plans.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500">
        Carregando planos disponíveis...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {plans.map((plan) => {
          const selected = selectedPlan === plan.id;
          const highlighted = plan.slug === HIGHLIGHTED_PLAN_SLUG;
          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => onSelect(plan.id)}
              aria-pressed={selected}
              className={`relative rounded-2xl border-2 p-5 text-left transition-all duration-150 ${
                selected
                  ? "border-emerald-600 bg-emerald-500/5 shadow-lg shadow-emerald-900/5"
                  : "border-zinc-200 bg-white shadow-sm hover:border-emerald-300 hover:shadow-md"
              }`}
            >
              {highlighted ? (
                <span className="absolute -top-3 left-5 rounded-full bg-emerald-600 px-3 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                  Mais popular
                </span>
              ) : null}

              {selected ? (
                <span className="absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600">
                  <Check className="h-4 w-4 text-white" strokeWidth={3} />
                </span>
              ) : null}

              <div className="pr-8">
                <div className="font-display text-lg font-bold text-zinc-900">
                  {plan.name}
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-black tracking-tight text-zinc-900">
                    R$ {plan.price.toFixed(2).replace(".", ",")}
                  </span>
                  <span className="text-sm font-medium text-zinc-500">
                    /mês
                  </span>
                </div>
                {plan.description ? (
                  <div className="mt-1.5 text-sm text-zinc-500">
                    {plan.description}
                  </div>
                ) : null}
              </div>

              <div className="my-4 h-px bg-zinc-200" />

              <ul className="space-y-2">
                {plan.features.map((f) => {
                  const label = featureLabel(f.feature);
                  const limited = f.limit !== null;
                  return (
                    <li
                      key={f.feature}
                      className={`flex items-center gap-2 text-sm ${
                        f.enabled
                          ? "text-zinc-700"
                          : "text-zinc-400 line-through"
                      }`}
                    >
                      <Check
                        className={`h-4 w-4 shrink-0 ${
                          f.enabled ? "text-emerald-600" : "text-zinc-400"
                        }`}
                        strokeWidth={3}
                      />
                      <span className="min-w-0 flex-1">{label}</span>
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
            </button>
          );
        })}
      </div>

      <Button onClick={onContinue} className="w-full" loading={loading}>
        Criar conta e seguir para o pagamento
      </Button>
      <p className="text-center text-xs text-zinc-500">
        Pagamento seguro via Stripe (PIX ou cartão) · Cancele quando quiser
      </p>
      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}
    </div>
  );
}
