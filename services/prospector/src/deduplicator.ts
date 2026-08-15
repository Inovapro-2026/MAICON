/**
 * Deduplicação para prospecção web.
 * Usa fingerprints: telefone, e-mail, domínio+cidade, nome+cidade.
 * Deduplica dentro da execução (first-seen vence) e contra a base existente do tenant.
 */
import { normalizePhone } from "@prospector/utils";
import { DedupeOutcome, QualifiedLead } from "./types";
import { domainCityFingerprint, nameCityFingerprint } from "./normalizer";

export interface ExistingKeys {
  phones: Set<string>;
  emails: Set<string>;
  domains: Set<string>;
}

/** Constrói os fingerprints de um lead qualificado. */
export function buildFingerprints(lead: {
  phone?: string;
  email?: string;
  website?: string;
  name: string;
  city?: string | null;
}): { phone?: string; email?: string; domainCity?: string; nameCity?: string } {
  const phone = lead.phone
    ? (normalizePhone(lead.phone) ?? undefined)
    : undefined;
  const email = lead.email?.toLowerCase().trim() || undefined;
  const domain = lead.website
    ? (domainCityFingerprint(lead.website, lead.city) ?? undefined)
    : undefined;
  const nameCity = nameCityFingerprint(lead.name, lead.city) ?? undefined;
  return { phone, email, domainCity: domain, nameCity };
}

export class ProspectionDeduplicator {
  private seen = new Set<string>();
  private seenReasons = new Map<string, string>();

  constructor(private existing: ExistingKeys) {}

  /** Verifica se um lead é novo. Se for, registra os fingerprints. */
  check(lead: {
    phone?: string;
    email?: string;
    website?: string;
    name: string;
    city?: string | null;
  }): DedupeOutcome {
    const fps = buildFingerprints(lead);
    const priority: Array<{ key: keyof typeof fps; label: string }> = [
      { key: "phone", label: "telefone já cadastrado" },
      { key: "email", label: "e-mail já cadastrado" },
      { key: "domainCity", label: "site+cidade já cadastrado" },
      { key: "nameCity", label: "nome+cidade já cadastrado" },
    ];

    for (const { key, label } of priority) {
      const fp = fps[key];
      if (!fp) continue;
      if (this.seen.has(fp))
        return { status: "DUPLICATE", reason: `${label} (nesta execução)` };
      if (key === "phone" && this.existing.phones.has(fp))
        return { status: "DUPLICATE", reason: label };
      if (key === "email" && this.existing.emails.has(fp))
        return { status: "DUPLICATE", reason: label };
      if (key === "domainCity" && this.existing.domains.has(fp))
        return { status: "DUPLICATE", reason: label };
    }

    for (const fp of Object.values(fps)) {
      if (fp && !this.seen.has(fp)) {
        this.seen.add(fp);
        this.seenReasons.set(
          fp,
          fps.phone === fp ? "phone" : fps.email === fp ? "email" : "identity",
        );
      }
    }
    return { status: "NEW" };
  }
}

export type { QualifiedLead };
