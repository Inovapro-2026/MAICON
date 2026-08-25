/**
 * DEDUPLICAÇÃO ENTRE FONTES (Google Maps × Instagram).
 *
 * Um mesmo negócio pode aparecer nas duas fontes ("Barbearia Imperial" no
 * Google Maps e @barbeariaimperial no Instagram) — sem deduplicação, viram
 * dois leads para a mesma empresa.
 *
 * Estratégia de correspondência (em ordem, a primeira que gerar match
 * confiável vence):
 *   1. Telefone normalizado igual.
 *   2. Nome muito similar + mesma cidade (case-insensitive, sem acentos).
 *   3. Domínio do site igual.
 *
 * Se nenhuma correspondência for encontrada, os leads permanecem separados —
 * NUNCA forçamos merge sem confiança razoável.
 */
import { extractDomain, normalizePhone } from "./contact-extractor";
import { ConsolidatedLead, RawApifyLead } from "./types";

/** Normaliza nome para comparação (minúsculo, sem acentos, sem pontuação). */
export function normalizeNameForCompare(name: string): string {
  return String(name ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Similaridade de sequência (0..1) baseada na distância de Levenshtein. */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeNameForCompare(a);
  const nb = normalizeNameForCompare(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const shorter = na.length < nb.length ? na : nb;
  const longer = na.length < nb.length ? nb : na;
  if (shorter.length < 4) return 0;
  if (longer.includes(shorter)) return shorter.length / longer.length;
  return 1 - levenshtein(na, nb) / Math.max(na.length, nb.length);
}

/** Distância de Levenshtein (menor = mais similar). */
function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0),
  );
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[a.length][b.length];
}

/** Chave confiável de correspondência entre duas fontes. */
export function crossSourceKey(lead: RawApifyLead): string {
  const phone = normalizePhone(lead.phone ?? "");
  if (phone) return `phone:${phone}`;
  const domain = lead.website ? extractDomain(lead.website) : null;
  if (domain) return `domain:${domain}`;
  const name = normalizeNameForCompare(lead.name);
  const city = normalizeNameForCompare(lead.city ?? "");
  if (name && name.length >= 4) return `namecity:${name}|${city}`;
  return `id:${lead.source}:${lead.externalId ?? ""}`;
}

/**
 * Agrupa leads das duas fontes em consolidações por negócio.
 * Retorna uma lista de leads consolidados, cada um com `sources[]`.
 * Leads sem correspondência confiável permanecem individuais.
 */
export function consolidateAcrossSources(leads: RawApifyLead[]): ConsolidatedLead[] {
  const groups: RawApifyLead[][] = [];
  const keyToGroup = new Map<string, number>();

  for (const lead of leads) {
    const key = crossSourceKey(lead);

    // 1) Mesma chave exata → mesmo grupo.
    const existing = keyToGroup.get(key);
    if (existing !== undefined) {
      groups[existing].push(lead);
      continue;
    }

    // 2) Correspondência por similaridade de nome+cidade (mesma fonte ou não).
    //    Só cruza fontes diferentes para reduzir falsos positivos.
    let matchedGroup: number | null = null;
    if (key.startsWith("namecity:")) {
      for (let gi = 0; gi < groups.length; gi++) {
        for (const other of groups[gi]) {
          if (other.source === lead.source) continue;
          const sameCity =
            normalizeNameForCompare(other.city ?? "") ===
            normalizeNameForCompare(lead.city ?? "");
          if (sameCity && nameSimilarity(other.name, lead.name) >= 0.85) {
            matchedGroup = gi;
            break;
          }
        }
        if (matchedGroup !== null) break;
      }
    }

    if (matchedGroup !== null) {
      groups[matchedGroup].push(lead);
      keyToGroup.set(key, matchedGroup);
    } else {
      keyToGroup.set(key, groups.length);
      groups.push([lead]);
    }
  }

  return groups.map((group) => mergeGroup(group));
}

/** Mescla um grupo em um lead consolidado (o primeiro não-vazio vence por campo). */
function mergeGroup(group: RawApifyLead[]): ConsolidatedLead {
  const primary = group[0];
  const sources = [...new Set(group.map((g) => g.source))];
  const merged: ConsolidatedLead = { ...primary, sources };

  for (const g of group) {
    if (!merged.phone && g.phone) merged.phone = g.phone;
    if (!merged.email && g.email) merged.email = g.email;
    if (!merged.website && g.website) merged.website = g.website;
    if (!merged.instagram && g.instagram) merged.instagram = g.instagram;
    if (!merged.instagramUsername && g.instagramUsername)
      merged.instagramUsername = g.instagramUsername;
    if (!merged.address && g.address) merged.address = g.address;
    if (!merged.segment && g.segment) merged.segment = g.segment;
    if (!merged.bio && g.bio) merged.bio = g.bio;
    if (g.followersCount !== undefined) merged.followersCount = g.followersCount;
  }

  return merged;
}
