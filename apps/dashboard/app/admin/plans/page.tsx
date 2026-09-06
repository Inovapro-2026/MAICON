"use client";

import { useEffect, useState } from "react";
import { adminApi, AdminPlan, AdminPlanFeature } from "@/lib/admin";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

const brl = (n: number) =>
  `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

const parsePrice = (v: string): number | null => {
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

const FEATURE_LABELS: Record<string, string> = {
  max_users: "Usuários",
  max_contacts: "Contatos",
  max_conversations: "Conversas",
  max_messages: "Mensagens",
  max_agents: "Agentes de IA",
  max_whatsapp_connections: "Conexões de WhatsApp",
  max_automations: "Automações",
  max_knowledge_items: "Itens de conhecimento",
  max_storage: "Armazenamento (GB)",
  max_ai_usage: "Uso de IA",
  prospeccao_web: "Prospecção web",
  whatsapp_group_extraction: "Extração de grupos do WhatsApp",
};

const featureLabel = (key: string) => FEATURE_LABELS[key] ?? key;

interface PlanForm {
  name: string;
  slug: string;
  price: string;
  description: string;
  billing_interval: "MONTHLY" | "YEARLY";
  trial_days: string;
  active: boolean;
  sort_order: string;
  stripe_product_id: string;
  stripe_price_id: string;
  features: AdminPlanFeature[];
}

const emptyForm = (): PlanForm => ({
  name: "",
  slug: "",
  price: "0",
  description: "",
  billing_interval: "MONTHLY",
  trial_days: "0",
  active: true,
  sort_order: "0",
  stripe_product_id: "",
  stripe_price_id: "",
  features: [],
});

export default function AdminPlansPage() {
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<PlanForm>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await adminApi<{ plans: AdminPlan[] }>("/admin/plans");
      setPlans(result.plans);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar planos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openEdit = (p: AdminPlan) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      slug: p.slug,
      price: String(p.price),
      description: p.description ?? "",
      billing_interval: p.billing_interval === "YEARLY" ? "YEARLY" : "MONTHLY",
      trial_days: String(p.trial_days ?? 0),
      active: p.active,
      sort_order: String(p.sort_order ?? 0),
      stripe_product_id: p.stripe_product_id ?? "",
      stripe_price_id: p.stripe_price_id ?? "",
      features: p.features.map((f) => ({ ...f })),
    });
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({
      ...emptyForm(),
      price: "39.9",
      features: [
        { feature: "max_users", enabled: true, limit: null },
        { feature: "max_contacts", enabled: true, limit: null },
        { feature: "max_conversations", enabled: true, limit: null },
        { feature: "max_messages", enabled: true, limit: null },
      ],
    });
  };

  const setFeature = (i: number, patch: Partial<AdminPlanFeature>) => {
    setForm((f) => ({
      ...f,
      features: f.features.map((feat, idx) =>
        idx === i ? { ...feat, ...patch } : feat,
      ),
    }));
  };

  const addFeature = () => {
    setForm((f) => ({
      ...f,
      features: [...f.features, { feature: "", enabled: true, limit: null }],
    }));
  };

  const removeFeature = (i: number) => {
    setForm((f) => ({
      ...f,
      features: f.features.filter((_, idx) => idx !== i),
    }));
  };

  const persist = async () => {
    setSaving(true);
    setError(null);
    const price = parsePrice(form.price);
    if (price === null) {
      setError("Preço inválido. Use ponto ou vírgula decimal (ex.: 59,90).");
      setSaving(false);
      return;
    }
    const payload = {
      name: form.name,
      slug: form.slug,
      price,
      description: form.description,
      billing_interval: form.billing_interval,
      trial_days: Number(form.trial_days || 0),
      active: form.active,
      sort_order: Number(form.sort_order || 0),
      stripe_product_id: form.stripe_product_id || null,
      stripe_price_id: form.stripe_price_id || null,
      features: form.features,
    };
    try {
      if (editingId) {
        await adminApi(`/admin/plans/${editingId}`, "PATCH", payload);
      } else {
        await adminApi("/admin/plans", "POST", payload);
      }
      setEditingId(null);
      setCreating(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar plano");
    } finally {
      setSaving(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void persist();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="heading-strong text-xl">
            Planos
          </h1>
          <p className="text-sm text-zinc-500">
            Alterações de preço/features valem para <strong>novos</strong>{" "}
            cadastros — assinaturas ativas mantêm o valor contratado.
          </p>
        </div>
        <Button
          onClick={() => {
            setError(null);
            setCreating((c) => !c);
            openCreate();
          }}
          disabled={creating}
        >
          {creating ? "Cancelar" : "Novo plano"}
        </Button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}

      {creating && (
        <Card className="p-4">
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Nome"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
            <Input
              label="Slug"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              required
              placeholder="ex.: professional"
            />
            <Input
              label="Preço mensal (R$)"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              inputMode="decimal"
              required
            />
            <Input
              label="Dias de trial"
              value={form.trial_days}
              onChange={(e) => setForm({ ...form, trial_days: e.target.value })}
              inputMode="numeric"
            />
            <Input
              label="Descrição"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                className="accent-emerald-500"
              />
              Plano ativo
            </label>
            <div className="sm:col-span-2 flex flex-wrap gap-2">
              {form.features.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-lg bg-white px-3 py-2"
                >
                  <input
                    type="checkbox"
                    checked={f.enabled}
                    onChange={(e) =>
                      setFeature(i, { enabled: e.target.checked })
                    }
                    className="accent-emerald-500"
                  />
                  <span className="w-44 shrink-0 text-sm text-zinc-700">
                    {featureLabel(f.feature) || "Nova feature"}
                  </span>
                  <Input
                    value={f.feature}
                    onChange={(e) => setFeature(i, { feature: e.target.value })}
                    className="w-44"
                    placeholder="chave da feature"
                  />
                  <Input
                    value={f.limit ?? ""}
                    onChange={(e) =>
                      setFeature(i, {
                        limit:
                          e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    className="w-24"
                    placeholder="limite"
                    inputMode="numeric"
                  />
                  <button
                    type="button"
                    onClick={() => removeFeature(i)}
                    className="text-xs text-zinc-500 hover:text-red-600"
                  >
                    remover
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addFeature}
                className="rounded-lg border border-zinc-200 px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-50"
              >
                + recurso
              </button>
            </div>
            <div className="sm:col-span-2 flex gap-2">
              <Button type="submit" loading={saving}>
                Salvar plano
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreating(false)}
              >
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      )}

      {loading ? (
        <div className="text-sm text-zinc-500">Carregando...</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {plans.map((plan) => (
            <Card key={plan.id} className="flex flex-col p-4">
              <div className="flex items-center justify-between">
                <div className="font-display font-semibold text-zinc-900">
                  {plan.name}
                </div>
                {plan.active ? (
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-600">
                    ativo
                  </span>
                ) : (
                  <span className="rounded-full border border-zinc-300 bg-zinc-600/15 px-2 py-0.5 text-[11px] text-zinc-500">
                    inativo
                  </span>
                )}
              </div>
              <div className="mt-1 text-lg font-bold text-zinc-900">
                {brl(plan.price)}
                <span className="text-xs font-normal text-zinc-500">
                  /{plan.billing_interval === "YEARLY" ? "ano" : "mês"}
                </span>
              </div>
              {plan.description ? (
                <div className="mt-1 text-xs text-zinc-500">
                  {plan.description}
                </div>
              ) : null}
              <div className="mt-2 text-[11px] text-zinc-500">
                slug: {plan.slug} · {plan.features.length}{" "}
                {plan.features.length === 1 ? "recurso" : "recursos"}
              </div>
              <div className="mt-3 flex-1 space-y-1">
                {plan.features.slice(0, 5).map((f) => (
                  <div
                    key={f.feature}
                    className="flex items-center justify-between text-[11px]"
                  >
                    <span
                      className={
                        f.enabled
                          ? "text-zinc-500"
                          : "text-zinc-500 line-through"
                      }
                    >
                      {featureLabel(f.feature)}
                    </span>
                    <span className="text-zinc-500">
                      {f.limit != null ? f.limit : "∞"}
                    </span>
                  </div>
                ))}
                {plan.features.length > 5 ? (
                  <div className="text-[10px] text-zinc-500">
                    +{plan.features.length - 5}{" "}
                    {plan.features.length - 5 === 1 ? "recurso" : "recursos"}
                  </div>
                ) : null}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="mt-3 w-full"
                onClick={() => openEdit(plan)}
              >
                Editar
              </Button>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={editingId !== null}
        onClose={() => setEditingId(null)}
        title="Editar plano"
        footer={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditingId(null)}>
              Cancelar
            </Button>
            <Button onClick={() => void persist()} loading={saving}>
              Salvar
            </Button>
          </div>
        }
      >
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Nome"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
            <Input
              label="Slug"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Preço (R$)"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              inputMode="decimal"
              required
            />
            <Input
              label="Dias de trial"
              value={form.trial_days}
              onChange={(e) => setForm({ ...form, trial_days: e.target.value })}
              inputMode="numeric"
            />
          </div>
          <Input
            label="Descrição"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="stripeProductId"
              value={form.stripe_product_id}
              onChange={(e) =>
                setForm({ ...form, stripe_product_id: e.target.value })
              }
              placeholder="prod_..."
            />
            <Input
              label="stripePriceId"
              value={form.stripe_price_id}
              onChange={(e) =>
                setForm({ ...form, stripe_price_id: e.target.value })
              }
              placeholder="price_..."
            />
          </div>
          <div className="grid grid-cols-2 items-end gap-3">
            <div>
              <label className="label">Intervalo</label>
              <select
                className="input"
                value={form.billing_interval}
                onChange={(e) =>
                  setForm({
                    ...form,
                    billing_interval: e.target.value as "MONTHLY" | "YEARLY",
                  })
                }
              >
                <option value="MONTHLY">Mensal</option>
                <option value="YEARLY">Anual</option>
              </select>
            </div>
            <label className="flex items-center gap-2 pb-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                className="accent-emerald-500"
              />
              Plano ativo
            </label>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-700">
                Recursos
              </span>
              <button
                type="button"
                onClick={addFeature}
                className="text-xs text-emerald-600 hover:underline"
              >
                + adicionar
              </button>
            </div>
            <div className="space-y-2">
              {form.features.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-lg bg-white px-3 py-2"
                >
                  <input
                    type="checkbox"
                    checked={f.enabled}
                    onChange={(e) =>
                      setFeature(i, { enabled: e.target.checked })
                    }
                    className="accent-emerald-500"
                  />
                  <span className="w-44 shrink-0 text-sm text-zinc-700">
                    {featureLabel(f.feature) || "Nova feature"}
                  </span>
                  <Input
                    value={f.feature}
                    onChange={(e) => setFeature(i, { feature: e.target.value })}
                    className="flex-1"
                    placeholder="chave da feature"
                  />
                  <Input
                    value={f.limit ?? ""}
                    onChange={(e) =>
                      setFeature(i, {
                        limit:
                          e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    className="w-24"
                    placeholder="limite"
                    inputMode="numeric"
                  />
                  <button
                    type="button"
                    onClick={() => removeFeature(i)}
                    className="text-xs text-zinc-500 hover:text-red-600"
                  >
                    remover
                  </button>
                </div>
              ))}
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
