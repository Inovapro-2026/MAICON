"use client";

/** Cliente das rotas /admin da API (requer sessão de PLATFORM_ADMIN). */
export async function adminApi<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const res = await fetch(`/api/proxy${path}`, {
    method,
    headers:
      body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = (await res.json()) as {
    success?: boolean;
    data?: T;
    error?: { message?: string };
  };
  if (!res.ok || !data.success) {
    throw new Error(data?.error?.message ?? `Erro HTTP ${res.status}`);
  }
  return data.data as T;
}

/** Guarda o token de impersonation na sessão do dashboard. */
export async function setSessionToken(token: string): Promise<void> {
  const res = await fetch("/api/auth/session/set", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) throw new Error("Falha ao trocar de sessão");
}

export interface AdminBusiness {
  id: string;
  name: string;
  slug: string;
  status: string;
  email: string | null;
  cnpj: string | null;
  segment: string | null;
  created_at: string;
  _count: {
    leads: number;
    conversations: number;
    messages: number;
    members: number;
  };
  subscriptions: { status: string; plan_name: string | null }[];
}

export interface AdminDashboard {
  mrr: number;
  arr: number;
  mrr_value: number;
  month_revenue: number;
  total_revenue: number;
  new_clients: number;
  active_clients: number;
  trial: number;
  cancelled: number;
  churn: number;
  overdue_subscriptions: number;
  pending_payments: number;
  revenue_trend: { day: string; value: number }[];
  business_growth: { month: string; count: number }[];
  ai_usage: {
    messages: number;
    conversations: number;
    generations: number;
    contacts: number;
    tokens: number;
    input_tokens: number;
    output_tokens: number;
    estimated_cost_brl: number;
  };
  messages: {
    total: number;
    inbound: number;
    outbound: number;
    avg_per_client: number;
  };
  businesses: { total: number; active: number; pending_payment: number };
}

export interface AdminPlanFeature {
  id?: string;
  feature: string;
  enabled: boolean;
  limit: number | null;
}

export interface AdminPlan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  billing_interval: string;
  trial_days: number;
  active: boolean;
  sort_order: number;
  stripe_product_id: string | null;
  stripe_price_id: string | null;
  features: AdminPlanFeature[];
}

export interface AdminSubscription {
  id: string;
  business_id: string;
  status: string;
  plan_name: string | null;
  plan_price: number | null;
  current_period_start: string | null;
  current_period_end: string | null;
  trial_ends_at: string | null;
  cancelled_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  created_at: string;
  business: {
    id: string;
    name: string;
    slug: string;
    email: string | null;
    status: string;
  } | null;
  _count?: { payments: number };
}

export interface AdminSubscriptionDetail extends AdminSubscription {
  plan: {
    id: string;
    name: string;
    slug: string;
    price: number;
    description: string | null;
    active: boolean;
  } | null;
  payments: AdminPayment[];
}

export interface AdminPayment {
  id: string;
  status: string;
  method: string;
  value: number;
  created_at: string;
  paid_at: string | null;
  due_date: string | null;
  stripe_payment_intent_id: string | null;
  stripe_checkout_session_id: string | null;
  stripe_charge_id: string | null;
  business: { id: string; name: string; slug: string } | null;
  subscription: { id: string; plan_name: string | null; status: string } | null;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
  platform_role: string;
  active: boolean;
  created_at: string;
}

export interface AdminUserDetail extends AdminUser {
  must_change_password: boolean;
  memberships: {
    id: string;
    role: string;
    business: { id: string; name: string; slug: string; status: string };
  }[];
}

export interface AuditLogEntry {
  id: string;
  actor: string | null;
  business_id: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  metadata: unknown;
  created_at: string;
}

export interface AdminUsageRow {
  business_id: string;
  business_name: string;
  business_slug: string;
  messages_sent: number;
  messages_received: number;
  conversations: number;
  ai_generations: number;
  ai_input_tokens: number;
  ai_output_tokens: number;
  leads_created: number;
  opt_outs: number;
}

export interface SettingRow {
  key: string;
  value: string;
  updated_at?: string;
}

export interface AdminApiKey {
  id: string;
  provider: string;
  label: string | null;
  key_suffix: string;
  status: string;
  last_error: string | null;
  used_at: string | null;
  created_at: string;
}
