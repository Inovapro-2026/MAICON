/**
 * Extração de contatos de participantes de grupos do WhatsApp.
 *
 * Lógica PURA (testável — não depende de Baileys/banco):
 *  - converte uma JID de participante em telefone E.164;
 *  - aplica opções da extração (excluir admins, ignorar próprio contato,
 *    remover duplicados);
 *  - gera os contatos (telefone + nome) e o resumo (encontrados/únicos/
 *    duplicados/com telefone) usado no painel após a extração.
 *
 * A extração NUNCA envia mensagens: os contatos viram leads para revisão/
 * campanha. Nome em branco é aceito (contato é salvo como telefone apenas).
 */
import { digitsOnly, normalizePhone } from '@prospector/utils';

export interface WhatsAppParticipant {
  id: string;
  isAdmin?: boolean;
  admin?: string | null;
  name?: string | null;
  /**
   * PN (telefone) que o servidor do WhatsApp devolve na metadata do grupo
   * para participantes JID tipo LID (participant.phone_number no Baileys).
   */
  phoneNumber?: string | null;
  /** username (nome definido pelo próprio usuário) enviado na metadata. */
  username?: string | null;
}

export interface ExtractedContact {
  phone: string | null;
  name: string | null;
  isAdmin: boolean;
  rawJid: string;
}

export interface ExtractOptions {
  /** Remove participantes que são admin do grupo (admin/superadmin). */
  excludeAdmins?: boolean;
  /** Ignora o próprio número conectado (owner). */
  ignoreOwnContact?: boolean;
  /** Telefone E.164 do próprio contato (número logado no WhatsApp). */
  ownPhone?: string | null;
  /** Remove duplicados por telefone dentro da extração. Default: true. */
  removeDuplicates?: boolean;
  /** Resolve JID tipo LID (@lid) para telefone (Baileys lidMapping). */
  resolveLidPhone?: (lidJid: string) => Promise<string | null>;
}

export interface ExtractionSummary {
  /** Contatos processados (após exclusões de admin/próprio contato). */
  found: number;
  /** Únicos por telefone (contato válido de fato). */
  unique: number;
  /** found - unique (duplicados internos por telefone). */
  duplicates: number;
  /** Únicos com telefone E.164 válido. */
  phone: number;
  /** Únicos sem telefone válido (descartados na gravação). */
  noPhone: number;
}

export const EMPTY_SUMMARY: ExtractionSummary = {
  found: 0,
  unique: 0,
  duplicates: 0,
  phone: 0,
  noPhone: 0,
};

/** Grupo do WhatsApp como retornado para o painel (lista de seleção). */
export interface WhatsAppGroupSummary {
  jid: string;
  subject: string;
  size: number | null;
}

/** True para JIDs que não são contato individual (grupo/broadcast). */
export function isGroupOrBroadcastJid(jid: string): boolean {
  return jid.includes('@g.us') || jid.includes('@broadcast');
}

/** True quando o participante é admin do grupo. */
export function isAdminParticipant(p: WhatsAppParticipant): boolean {
  return (
    p?.isAdmin === true ||
    p?.admin === 'admin' ||
    p?.admin === 'superadmin'
  );
}

/**
 * Converte a JID de um participante individual em telefone E.164.
 * - JIDs @s.whatsapp.net / sem servidor: usa os dígitos antes do @.
 * - JIDs @lid: não resolvíveis aqui (precisa do lidMapping do Baileys) → null.
 * - JIDs de grupo/broadcast: null.
 */
export function phoneFromParticipantJid(jid: string): string | null {
  if (!jid) return null;
  if (isGroupOrBroadcastJid(jid)) return null;
  if (jid.includes('@lid')) return null;
  const local = jid.split('@')[0].split(':')[0];
  const digits = digitsOnly(local);
  if (!digits) return null;
  return normalizePhone(digits);
}

/** Extrai os contatos (telefone + nome) de um grupo, aplicando as opções. */
export async function extractContacts(
  participants: WhatsAppParticipant[],
  options: ExtractOptions = {},
): Promise<{ contacts: ExtractedContact[]; summary: ExtractionSummary }> {
  const excludeAdmins = options.excludeAdmins === true;
  const ignoreOwn = options.ignoreOwnContact === true;
  const removeDuplicates = options.removeDuplicates !== false;
  const ownPhone = options.ownPhone ?? null;

  const records: ExtractedContact[] = [];

  for (const p of participants ?? []) {
    const rawJid = String(p?.id ?? '');
    if (!rawJid) continue;
    if (isGroupOrBroadcastJid(rawJid)) continue;
    if (excludeAdmins && isAdminParticipant(p)) continue;

    let phone: string | null = null;
    if (rawJid.includes('@lid')) {
      // 1) O servidor devolve o PN (phone_number) na metadata — fonte primária.
      // 2) Fallback: resolve via lidMapping do Baileys (só tem o que já foi mapeado).
      phone =
        (p?.phoneNumber && phoneFromParticipantJid(String(p.phoneNumber))) ||
        (options.resolveLidPhone ? await options.resolveLidPhone(rawJid) : null);
      // LIDs resolvem para dígitos sem prefixo — normaliza
      if (phone && !phone.startsWith('+')) {
        phone = normalizePhone(phone) ?? phone;
      }
    } else {
      phone = phoneFromParticipantJid(rawJid);
    }

    if (ignoreOwn && ownPhone && phone && phone === ownPhone) continue;

    const participantName =
      (p?.name && String(p.name).trim()) ||
      (p?.username && String(p.username).trim()) ||
      null;

    records.push({
      phone,
      name: participantName,
      isAdmin: isAdminParticipant(p),
      rawJid,
    });
  }

  let unique: ExtractedContact[] = records;
  let duplicates = 0;
  let phoneCount = 0;
  let noPhoneCount = 0;

  if (removeDuplicates) {
    const seen = new Map<string, ExtractedContact>();
    const order: ExtractedContact[] = [];
    for (const rec of records) {
      if (rec.phone) {
        if (!seen.has(rec.phone)) {
          seen.set(rec.phone, rec);
          order.push(rec);
        } else {
          duplicates += 1;
        }
      } else {
        order.push(rec);
      }
    }
    unique = order;
  }

  for (const rec of unique) {
    if (rec.phone) phoneCount += 1;
    else noPhoneCount += 1;
  }

  const summary: ExtractionSummary = {
    found: records.length,
    unique: unique.length,
    duplicates,
    phone: phoneCount,
    noPhone: noPhoneCount,
  };

  return { contacts: unique, summary };
}