import { ImportRowStatus, LeadSource, LeadStatus } from './enums';

export interface Lead {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  business_name: string | null;
  city: string | null;
  state: string | null;
  source: LeadSource;
  status: LeadStatus;
  external_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Registro cru proveniente do arquivo antes de normalização. */
export interface RawLeadRecord {
  rowIndex: number;
  name?: string;
  phone?: string;
  email?: string;
  businessName?: string;
  city?: string;
  state?: string;
  externalId?: string;
  [key: string]: unknown;
}

/** Resultado da normalização/validação de uma linha. */
export interface ProcessedLead {
  rowIndex: number;
  raw: RawLeadRecord;
  name: string | null;
  phone: string | null;
  email: string | null;
  businessName: string | null;
  city: string | null;
  state: string | null;
  externalId: string | null;
  /** Motivos de invalidação, se houver. */
  errors: string[];
  /** Razões da deduplicação, se duplicado. */
  duplicateReasons: string[];
  status: ImportRowStatus;
  /** fingerprint usado na deduplicação */
  fingerprints: Record<string, string>;
}

export interface ImportSummary {
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  newLeads: number;
  rows: ProcessedLead[];
  errorsByRow: Record<number, string[]>;
}
