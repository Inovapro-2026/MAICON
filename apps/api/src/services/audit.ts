/**
 * Auditoria centralizada (SAVYRON). Registra ações importantes da plataforma
 * (login, criação, edição, plano, assinatura, pagamento, suspensão, reativação,
 * impersonation) para trilha auditável e uso no /admin/audit.
 */
import { prisma } from '@prospector/database';

export interface AuditInput {
  actor?: string | null;
  businessId?: string | null;
  action: string;
  entity?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function writeAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actor: input.actor ?? undefined,
        business_id: input.businessId ?? undefined,
        action: input.action,
        entity: input.entity ?? undefined,
        entity_id: input.entityId ?? undefined,
        metadata: (input.metadata as object) ?? undefined,
      },
    });
  } catch (error) {
    // Avaliar auditoria é best-effort; nunca derruba a operação principal.
    // eslint-disable-next-line no-console
    console.error('Falha ao registrar auditoria', error);
  }
}