/**
 * Máquina de estados de conversa (PURA, sem dependências de banco) — SAVYRON.
 *
 * Decide, em nível de código, qual é a PRÓXIMA AÇÃO do onboarding dado o
 * estágio atual e a mensagem do cliente. O LLM NUNCA decide o fluxo: ele
 * apenas conversa quando `PROCEED_TO_AI` é a decisão.
 *
 *   NOT_STARTED ──1ª mensagem────> SEND_GREETING  → GREETED
 *   GREETED ──────afirmativa─────> SEND_ASK_NAME  → AWAITING_NAME
 *   GREETED ──────outra coisa────> WAIT (não avança)
 *   AWAITING_NAME ──nome válido──> SEND_NAME_CONFIRMED → NAME_CAPTURED
 *   AWAITING_NAME ──nome inválido> SEND_ASK_NAME_AGAIN (mantém estágio)
 *   NAME_CAPTURED ───────────────> PROCEED_TO_AI (IA assume)
 */

import { isAffirmativeResponse } from './prompts';

export type ConversationStage =
  | 'NOT_STARTED'
  | 'GREETED'
  | 'COMPANY_INTRODUCED'
  | 'AWAITING_NAME'
  | 'NAME_CAPTURED';

export type ConversationAction =
  | 'SEND_GREETING'
  | 'SEND_ASK_NAME'
  | 'SEND_ASK_NAME_AGAIN'
  | 'SEND_NAME_CONFIRMED'
  | 'PROCEED_TO_AI'
  | 'WAIT';

export interface TurnDecision {
  action: ConversationAction;
  nextStage?: ConversationStage;
}

export interface NameValidationLike {
  valid: boolean;
  name?: string;
}

export interface ConversationTurnInput {
  stage: ConversationStage | null | undefined;
  content: string;
  /** Resultado de validateClientName (somente usado no estágio AWAITING_NAME). */
  nameValidation?: NameValidationLike;
}

export function decideConversationTurn(input: ConversationTurnInput): TurnDecision {
  const { stage, content, nameValidation } = input;

  if (stage === 'NOT_STARTED') {
    return { action: 'SEND_GREETING', nextStage: 'GREETED' };
  }

  if (stage === 'GREETED' || stage === 'COMPANY_INTRODUCED') {
    if (isAffirmativeResponse(content)) {
      return { action: 'SEND_ASK_NAME', nextStage: 'AWAITING_NAME' };
    }
    // Não confirmou o convite: não avança e não envia (evita spam).
    return { action: 'WAIT' };
  }

  if (stage === 'AWAITING_NAME') {
    if (nameValidation?.valid && nameValidation.name) {
      return { action: 'SEND_NAME_CONFIRMED', nextStage: 'NAME_CAPTURED' };
    }
    return { action: 'SEND_ASK_NAME_AGAIN' };
  }

  // NAME_CAPTURED (READY_FOR_AI) ou conversa legada sem estágio → IA assume.
  return { action: 'PROCEED_TO_AI' };
}
