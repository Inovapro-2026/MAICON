/**
 * Política central de exclusão (SAVYRON) — funções PURAS, testáveis sem banco.
 * Usadas pelos serviços de exclusão da API e validadas nos testes de unidade.
 */

import type { BusinessRole } from './admin';

/** "Importado" = lead criado via importação (qualquer source != MANUAL). */
export function isImportedLeadSource(source: string | null | undefined): boolean {
  return !!source && source !== 'MANUAL';
}

/** Ações destrutivas em massa são restritas a OWNER/BUSINESS_ADMIN. */
export function isBusinessOwnerOrAdmin(role: BusinessRole | string | null | undefined): boolean {
  return role === 'OWNER' || role === 'BUSINESS_ADMIN';
}

/**
 * Escopo obrigatório de isolamento multi-tenant: toda exclusão deve filtrar
 * por business_id para nunca tocar em dados de outra empresa.
 */
export function businessScope(businessId: string): { business_id: string } {
  return { business_id: businessId };
}
