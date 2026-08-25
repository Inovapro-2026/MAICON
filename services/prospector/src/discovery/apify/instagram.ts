/**
 * FONTE B — Instagram (apify/instagram-scraper).
 *
 * Busca por local (searchType "place") para descobrir negócios marcados por
 * categoria+cidade, e por perfil ("user") para descobrir perfis comerciais por
 * palavra-chave.
 *
 * O scraper NÃO retorna e-mail/telefone estruturados — eles são extraídos via
 * regex da `biography`/`externalUrl`. Nome + Instagram + segmento já é dado
 * prospectável mesmo sem contato direto (mensagem direta no Instagram).
 */
import {
  extractEmailsFromText,
  extractPhonesBR,
  isSocialLink,
} from "./contact-extractor";
import { InstagramRecord, RawApifyLead } from "./types";

export type InstagramSearchType = "place" | "user";

export interface InstagramInputOptions {
  searchStringsArray: string[];
  locationQuery?: string;
  /** place = busca por local; user = busca por perfil comercial. */
  searchType: InstagramSearchType;
  /** Teto de perfis a retornar (custo por evento). */
  maxProfiles: number;
}

/** Monta o input do actor apify/instagram-scraper. */
export function buildInstagramInput(
  options: InstagramInputOptions,
): Record<string, unknown> {
  const max = Math.max(1, Math.min(options.maxProfiles, 100));
  return {
    searchType: options.searchType,
    searchStringsArray: options.searchStringsArray,
    ...(options.locationQuery
      ? { locationQuery: options.locationQuery, locationNames: options.locationQuery }
      : {}),
    resultsLimit: max,
    maxProfilesPerQuery: max,
    onlyPostsNewerThan: null,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
    shouldDownloadSubtitles: false,
    shouldDownloadSlideshowImages: false,
    shouldDownloadAvatars: false,
    shouldDownloadStories: false,
    shouldDownloadHighlights: false,
  };
}

/**
 * Extrai e-mail/telefone de um perfil do Instagram.
 * O scraper não traz esses campos estruturados — vêm soltos na bio/link.
 */
export function extractInstagramContacts(record: InstagramRecord): {
  emails: string[];
  phones: string[];
  website?: string;
} {
  const bio = String(record.biography ?? "");
  const url = String(record.externalUrl ?? "").trim();

  const emails = extractEmailsFromText(`${bio} ${url}`);
  const phones = extractPhonesBR(bio);
  // Só usa o link externo como site quando NÃO for rede social/linktree.
  const website = url && !isSocialLink(url) ? url : undefined;

  return { emails, phones, website };
}

/** Mapeia um perfil do Instagram para um lead bruto. */
export function mapInstagramRecord(record: InstagramRecord): RawApifyLead | null {
  const name = String(record.fullName ?? record.username ?? "").trim();
  const username = String(record.username ?? "").trim();
  if (!name && !username) return null;

  const contacts = extractInstagramContacts(record);
  const displayName = name || username;

  return {
    source: "instagram",
    externalId: username || undefined,
    name: displayName,
    email: contacts.emails[0],
    phone: contacts.phones[0],
    website: contacts.website,
    instagram: username ? `https://instagram.com/${username}` : undefined,
    instagramUsername: username || undefined,
    bio: String(record.biography ?? "").trim() || undefined,
    segment: record.category?.trim() || undefined,
    followersCount: record.followersCount ?? undefined,
    sourceUrl: record.url?.trim() || (username ? `https://instagram.com/${username}` : undefined),
  };
}
