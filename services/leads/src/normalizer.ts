/**
 * Normalizador de registros de leads.
 * Identifica colunas por nome (com suporte a sinônimos em português),
 * normaliza telefone para E.164 e e-mail para lowercase.
 */
import { RawLeadRecord } from '@prospector/types';
import { normalizeEmail, normalizePhone, sha256 } from '@prospector/utils';

const normalizeKey = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

const COLUMN_SYNONYMS: Record<string, string[]> = {
  name: ['nome', 'name', 'contato', 'responsavel', 'responsavel nome', 'dono', 'proprietario', 'proprietaria'],
  phone: [
    'telefone',
    'phone',
    'celular',
    'cel',
    'whatsapp',
    'whats',
    'fone',
    'tel',
    'mobile',
    'cell',
    'numero',
    'numero whatsapp',
    'whatsapp telefone',
    'telefone whatsapp',
  ],
  email: ['email', 'e-mail', 'correio', 'mail', 'endereco email'],
  businessName: ['empresa', 'negocio', 'business', 'estabelecimento', 'nome empresa', 'razao social', 'business name', 'nome do estabelecimento', 'estabelecimento'],
  city: ['cidade', 'city', 'municipio', 'municipality', 'cidade onde mora'],
  state: ['estado', 'uf', 'state', 'uf sigla', 'sigla uf'],
  externalId: ['id', 'identificador', 'external id', 'external_id', 'codigo', 'code', 'lead id'],
};

const KNOWN_KEYS = new Set(['name', 'phone', 'email', 'businessName', 'city', 'state', 'externalId']);

export interface ColumnMapping {
  name: string;
  phone: string;
  email: string;
  businessName: string;
  city: string;
  state: string;
  externalId: string;
}

/**
 * Identifica automaticamente quais colunas do arquivo correspondem a cada campo.
 * Retorna mapeamento header -> campo canônico.
 */
export function identifyColumns(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {
    name: '',
    phone: '',
    email: '',
    businessName: '',
    city: '',
    state: '',
    externalId: '',
  };

  const remaining = new Set(headers.map((h) => h.trim()));

  for (const [field, synonyms] of Object.entries(COLUMN_SYNONYMS)) {
    for (const header of headers) {
      const key = normalizeKey(header);
      if (synonyms.some((syn) => normalizeKey(syn) === key || key.includes(normalizeKey(syn)))) {
        if (remaining.has(header)) {
          mapping[field as keyof ColumnMapping] = header;
          remaining.delete(header);
          break;
        }
      }
    }
  }

  return mapping;
}

/** Extrai um valor seguro de string a partir da linha, dado o header. */
function valueOf(row: RawLeadRecord, header: string | undefined): string | undefined {
  if (!header) return undefined;
  const raw = row[header];
  if (raw === null || raw === undefined) return undefined;
  const str = String(raw).trim();
  return str === '' ? undefined : str;
}

/** Limpa um nome para exibição (título simples). */
export function normalizeName(value: string): string {
  if (!value) return '';
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 160);
}

export interface NormalizeOptions {
  /** Aplica 9º dígito/regras de celular. Default true. */
  normalizePhoneNumbers?: boolean;
}

/**
 * Normaliza um registro cru. Não valida: apenas limpa e padroniza.
 * Retorna os fingerprints de deduplicação.
 */
export function normalizeRecord(row: RawLeadRecord, mapping: ColumnMapping): {
  name: string | null;
  phone: string | null;
  email: string | null;
  businessName: string | null;
  city: string | null;
  state: string | null;
  externalId: string | null;
  fingerprints: Record<string, string>;
} {
  const name = valueOf(row, mapping.name);
  const phoneRaw = valueOf(row, mapping.phone);
  const emailRaw = valueOf(row, mapping.email);
  const businessName = valueOf(row, mapping.businessName);
  const city = valueOf(row, mapping.city);
  const stateRaw = valueOf(row, mapping.state);
  const externalId = valueOf(row, mapping.externalId);

  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  const email = emailRaw ? normalizeEmail(emailRaw) : null;

  const state =
    stateRaw && stateRaw.length <= 2 ? stateRaw.trim().toUpperCase() : stateRaw ? stateRaw.trim().toUpperCase().slice(0, 2) : null;

  const fingerprints: Record<string, string> = {};
  if (phone) fingerprints.phone = phone;
  if (email) fingerprints.email = email;
  if (externalId) fingerprints.extid = externalId.trim();
  const nameFp = normalizeName(name || '');
  if (phone && nameFp) {
    fingerprints.name_phone = sha256(`${nameFp.toLowerCase()}|${phone}`);
  }

  return {
    name: normalizeName(name || ''),
    phone,
    email,
    businessName: businessName ? businessName.trim().replace(/\s+/g, ' ').slice(0, 255) : null,
    city: city ? city.trim().replace(/\s+/g, ' ').slice(0, 120) : null,
    state,
    externalId: externalId ? externalId.trim().slice(0, 120) : null,
    fingerprints,
  };
}

export { KNOWN_KEYS };
