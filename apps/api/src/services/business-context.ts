import { prisma } from "@prospector/database";

export type BusinessRole = "OWNER" | "BUSINESS_ADMIN" | "MANAGER" | "AGENT";

export interface BusinessContext {
  businessId: string;
  businessRole: BusinessRole;
}

export interface BusinessSummary {
  id: string;
  name: string;
  slug: string;
  role: BusinessRole;
  status: string;
  /** Motivo da suspensão automática (ex.: "subscription_expired"). */
  suspension_reason: string | null;
}

/**
 * Lista as empresas às quais o usuário pertence, com o papel em cada uma.
 */
export async function listUserBusinesses(
  userId: string,
): Promise<BusinessSummary[]> {
  const memberships = await prisma.businessMember.findMany({
    where: { user_id: userId },
    include: { business: true },
    orderBy: { created_at: "asc" },
  });
  return memberships.map((m) => ({
    id: m.business.id,
    name: m.business.name,
    slug: m.business.slug,
    role: m.role,
    status: m.business.status,
    suspension_reason: m.business.suspension_reason,
  }));
}

/**
 * Valida o vínculo do usuário a uma empresa e retorna o contexto.
 * Retorna null se o usuário não pertence à empresa.
 */
export async function resolveBusinessContext(
  userId: string,
  businessId: string,
): Promise<BusinessContext | null> {
  const membership = await prisma.businessMember.findUnique({
    where: {
      business_id_user_id: { business_id: businessId, user_id: userId },
    },
    include: { business: true },
  });
  if (!membership) return null;
  if (
    membership.business.status === "SUSPENDED" ||
    membership.business.status === "CANCELLED"
  ) {
    return null;
  }
  return { businessId: membership.business_id, businessRole: membership.role };
}
