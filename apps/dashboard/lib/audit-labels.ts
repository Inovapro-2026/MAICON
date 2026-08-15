/**
 * Camada de apresentação da auditoria (/admin/audit).
 * Traduz o código técnico da action para uma frase em português, categoriza
 * por tom (cor) e formata o metadata em texto legível. O dado técnico bruto
 * (action/id/metadata) continua intacto no registro — apenas a exibição muda.
 */

/** action (código técnico) -> frase legível. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "admin.business.plan_changed": "Plano da empresa alterado",
  "admin.business.reset": "Conta da empresa resetada",
  "admin.business.status_changed": "Status da empresa alterado",
  "admin.business.updated": "Empresa atualizada",
  "admin.payment.reconciled": "Pagamento reconciliado",
  "admin.plan.created": "Plano criado",
  "admin.plan.updated": "Plano atualizado",
  "admin.settings.deleted": "Configuração global removida",
  "admin.settings.updated": "Configuração global atualizada",
  "admin.subscription.cancelled": "Assinatura cancelada",
  "admin.subscription.plan_changed": "Plano da assinatura alterado",
  "admin.subscription.reactivated": "Assinatura reativada",
  "admin.user.created": "Usuário criado",
  "admin.user.updated": "Usuário atualizado",

  "auth.signup": "Novo cadastro realizado",
  "business.activated_free_plan": "Plano gratuito ativado",
  "business.created": "Empresa criada",
  "business.settings.updated": "Configurações da empresa atualizadas",

  "cakto.event_processed": "Evento Cakto processado",
  "cakto.event_received": "Evento Cakto recebido",
  "stripe.event_processed": "Evento Stripe processado",
  "stripe.event_received": "Evento Stripe recebido",
  "payment.checkout_session_created": "Checkout Stripe criado",
  "payment.checkout_url_created": "Link de pagamento gerado",
  "payment.confirmed": "Pagamento confirmado",
  "payment.failed": "Pagamento falhou",
  "payment.pix_generated": "PIX gerado",
  "payment.refunded": "Pagamento estornado",
  "subscription.cancelled_by_gateway": "Assinatura cancelada pelo gateway",
  "subscription.created": "Assinatura criada",
  "subscription.renewal_refused": "Renovação de assinatura recusada",
  "subscription.renewed": "Assinatura renovada",
  "subscription.status_synced": "Status da assinatura sincronizado",

  "prospection.admin_bypass_plan": "Prospecção web liberada (admin)",
  "prospection.deleted": "Prospecção excluída",

  "support.session_started": "Sessão de suporte iniciada",
  "support.session_ended": "Sessão de suporte encerrada",

  "ai.agent.created": "Agente de IA criado",
  "ai.agent.deleted": "Agente de IA removido",
  "ai.agent.updated": "Agente de IA atualizado",
  "ai.knowledge.created": "Item de conhecimento criado",
  "ai.knowledge.deleted": "Item de conhecimento removido",
  "ai.knowledge.updated": "Item de conhecimento atualizado",
  "ai.playground.used": "Teste de IA realizado",
  "ai.settings.updated": "Configuração de IA atualizada",

  "conversation.deleted": "Conversa excluída",
  "conversations.cleared": "Conversas limpas",
  "leads.imported.cleared": "Leads importados limpos",
};

/** Frase exibida para uma action; fallback = código técnico (nunca quebra). */
export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

/** Classe de cor por categoria (prefixo da action). */
export function auditTone(action: string): string {
  if (action.startsWith("support.")) return "text-orange-600";
  if (
    action.startsWith("payment.") ||
    action.startsWith("subscription.") ||
    action.startsWith("admin.subscription.")
  )
    return "text-sky-600";
  if (action.startsWith("cakto.") || action.startsWith("stripe."))
    return "text-blue-600";
  if (
    action.startsWith("admin.user.") ||
    action.startsWith("ai.") ||
    action.startsWith("admin.plan.")
  )
    return "text-violet-600";
  if (
    action.startsWith("admin.business.") ||
    action.startsWith("business.") ||
    action.startsWith("prospection.")
  )
    return "text-emerald-600";
  if (
    action.startsWith("conversation.") ||
    action.startsWith("conversations.") ||
    action.startsWith("leads.")
  )
    return "text-red-600";
  return "text-emerald-600";
}

/** Rótulo legível de um campo de User.updated. */
const FIELD_LABELS: Record<string, string> = {
  platform_role: "Papel na plataforma",
  active: "Status da conta",
  name: "Nome",
  email: "E-mail",
  password_hash: "Senha",
  must_change_password: "Troca de senha",
};

/** Rótulos de status de pagamento/assinatura. */
const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  PENDING_PAYMENT: "Pendente de pagamento",
  PAID: "Pago",
  CONFIRMED: "Confirmado",
  RECEIVED: "Recebido",
  OVERDUE: "Em atraso",
  CANCELLED: "Cancelado",
  REFUNDED: "Estornado",
  FAILED: "Falhou",
  ACTIVE: "Ativa",
  TRIALING: "Em teste",
  TRIAL: "Em teste",
  SUSPENDED: "Suspensa",
  EXPIRED: "Expirada",
  PAST_DUE: "Em atraso",
  COMPLETED: "Concluída",
  PARTIAL: "Concluída parcialmente",
};

export interface AuditMetaContext {
  /** planId -> nome do plano (para metadata com plan_id/planId). */
  planNameById?: Record<string, string>;
}

export interface AuditMetaDescription {
  lines: string[];
  warnings: string[];
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

/**
 * Formata o metadata (JSON técnico) em frases legíveis, por tipo de ação.
 * Ações sem formatter específico mantêm o JSON cru (não esconde informação).
 */
export function describeAuditMeta(
  action: string,
  metadata: unknown,
  ctx: AuditMetaContext = {},
): AuditMetaDescription {
  const warnings: string[] = [];
  const lines: string[] = [];
  if (!metadata) return { lines, warnings };

  const m = isRecord(metadata) ? metadata : null;

  const planName = (id: unknown): string | null => {
    const key = str(id);
    if (!key) return null;
    return ctx.planNameById?.[key] ?? null;
  };

  switch (action) {
    case "admin.subscription.plan_changed":
    case "admin.business.plan_changed": {
      const id = m?.planId ?? m?.plan_id;
      const name = planName(id) ?? str(m?.plan_name);
      if (name) lines.push(`Plano alterado para ${name}`);
      break;
    }
    case "admin.user.updated": {
      if (Array.isArray(m?.fields)) {
        const labels = (m.fields as unknown[])
          .map((f) => (typeof f === "string" ? FIELD_LABELS[f] ?? f : null))
          .filter(Boolean) as string[];
        if (labels.length) lines.push(`Campos alterados: ${labels.join(", ")}`);
      }
      break;
    }
    case "admin.business.status_changed": {
      const status = str(m?.status) ?? str(m?.to);
      if (status) {
        lines.push(
          `Status alterado para ${STATUS_LABELS[status] ?? status}`,
        );
      }
      break;
    }
    case "support.session_started":
    case "support.session_ended": {
      const reason = str(m?.reason);
      const ip = str(m?.ip);
      if (reason) lines.push(`Motivo: ${reason}`);
      if (ip) lines.push(`IP: ${ip}`);
      if (str(m?.admin_email)) lines.push(`Admin: ${m?.admin_email}`);
      break;
    }
    case "payment.confirmed":
    case "payment.pix_generated":
    case "payment.refunded":
    case "payment.failed":
    case "payment.checkout_session_created":
    case "payment.checkout_url_created": {
      const method = str(m?.method);
      const value = str(m?.value);
      const status = str(m?.status) ?? str(m?.gateway_status);
      if (method && value) lines.push(`${method} · R$ ${value}`);
      else if (value) lines.push(`Valor: R$ ${value}`);
      if (status) lines.push(STATUS_LABELS[status] ?? status);
      break;
    }
    case "prospection.admin_bypass_plan":
    case "prospection.deleted": {
      const feature = str(m?.feature);
      const saved = m?.saved_count ?? m?.leads_deleted;
      if (feature) lines.push(`Recurso: ${feature}`);
      if (typeof saved === "number") lines.push(`${saved} leads`);
      break;
    }
    case "conversations.cleared":
    case "leads.imported.cleared": {
      const n = m?.deleted ?? m?.leads_deleted ?? m?.conversations_deleted;
      if (typeof n === "number") lines.push(`${n} itens excluídos`);
      break;
    }
    default:
      break;
  }

  // Warnings sempre destacados.
  if (Array.isArray(m?.warnings)) {
    for (const w of m.warnings as unknown[]) {
      if (typeof w === "string" && w) warnings.push(w);
    }
  }
  if (Array.isArray(m?.errors)) {
    for (const e of (m.errors as unknown[]).slice(0, 3)) {
      if (typeof e === "string" && e) warnings.push(e);
    }
  }

  return { lines, warnings };
}

/** JSON cru formatado (para tooltip/depuração). */
export function rawMetaText(metadata: unknown): string {
  if (metadata == null) return "{}";
  try {
    const s = JSON.stringify(metadata);
    return s.length > 400 ? `${s.slice(0, 400)}…` : s;
  } catch {
    return String(metadata);
  }
}
