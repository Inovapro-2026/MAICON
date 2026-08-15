/**
 * Enriquecimento de leads (resultado do serviço Scrapy).
 * Lógica pura e testável: monta o patch de atualização do Lead a partir dos
 * dados extraídos pelo spider. Nada é fabricado — só normaliza o que veio do site.
 */
import { normalizeEmail, normalizePhone } from "@prospector/utils";

export interface EnrichmentData {
  title?: string;
  emails?: string[];
  phones?: string[];
  instagram?: string;
  facebook?: string;
  whatsapp?: string;
}

/** Domínios de template/placeholder — nunca salvamos esses e-mails. */
const FABRICATED_DOMAIN_RE =
  /(example\.com|example\.org|exemplo\.com|exemplo\.com\.br|example\.com\.br|test\.com|\.test\b|\.invalid\b|\.local\b|localhost|seudominio|seudomain|dominio\.com|domain\.com|seusite|meusite|nomedosite|email\.com|mailinator|yopmail|guerrillamail|tempmail|foo\.com|foo\.bar)/i;

/**
 * Monta o patch de atualização do Lead. Não sobrescreve e-mail/telefone já
 * existentes (a fonte primária da prospecção tem prioridade); adiciona
 * instagram/facebook/whatsapp quando presentes e válidos. E-mails de domínios
 * fabricados/placeholder são descartados.
 */
export function buildEnrichmentPatch(
  lead: { email?: string | null; phone?: string | null },
  data: EnrichmentData | null | undefined,
): Record<string, string> {
  if (!data) return {};
  const patch: Record<string, string> = {};

  if (typeof data.instagram === "string" && data.instagram.trim()) {
    const handle =
      data.instagram.trim().replace(/^@/, "").split("/").pop() ?? "";
    if (handle.length >= 3) patch.instagram = handle;
  }
  if (typeof data.facebook === "string" && data.facebook.trim()) {
    patch.facebook = data.facebook.trim();
  }
  if (typeof data.whatsapp === "string" && data.whatsapp.trim()) {
    patch.whatsapp = data.whatsapp.trim();
  }

  if (Array.isArray(data.emails)) {
    for (const raw of data.emails) {
      const email = normalizeEmail(raw);
      if (email && !FABRICATED_DOMAIN_RE.test(email) && !lead.email) {
        patch.email = email;
        break;
      }
    }
  }

  if (Array.isArray(data.phones)) {
    for (const raw of data.phones) {
      const phone = normalizePhone(raw);
      if (phone && !lead.phone) {
        patch.phone = phone;
        break;
      }
    }
  }

  return patch;
}
