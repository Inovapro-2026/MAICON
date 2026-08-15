/**
 * Sequência de abertura de conversa — SAVYRON.
 *
 * O FLUXO é controlado pelo backend (máquina de estados), NÃO pelo LLM.
 * Cada turno do onboarding envia EXATAMENTE UMA mensagem e termina:
 *
 *   NOT_STARTED ──cliente envia 1ª msg──> GREETED (AWAITING_FIRST_RESPONSE)
 *   GREETED ──────cliente concorda──────> AWAITING_NAME
 *   AWAITING_NAME ──cliente informa nome──> NAME_CAPTURED (READY_FOR_AI)
 *
 * Os textos abaixo são TEMPLATES da plataforma, preenchidos com os dados
 * reais de "Configurar IA"/"Meu negócio" (nunca gerados pelo LLM).
 *
 * Identidade: o SAVYRON é apresentado pelo nome + descrição reais do negócio.
 * O campo `segment` NUNCA é usado como identidade ("somos uma agência") — ele
 * permanece apenas como contexto de mercado no prompt de sistema.
 */

export interface OpeningContext {
  agentName?: string | null;
  agentRole?: string | null;
  businessName?: string | null;
  businessSegment?: string | null;
  businessDescription?: string | null;
}

export interface OpeningMessages {
  /** Mensagem única do turno NOT_STARTED → GREETED (autoapresentação + convite). */
  greeting: string;
  /** Mensagem única do turno GREETED → AWAITING_NAME (cliente concordou). */
  askName: string;
  /** Re-pedido de nome quando a resposta do cliente não é um nome válido. */
  askNameAgain: string;
}

/** Monta o template de 1ª mensagem com dados reais (1 única mensagem por turno). */
export function buildOpeningMessages(ctx: OpeningContext): OpeningMessages {
  const agentName = ctx.agentName?.trim();
  const role = ctx.agentRole?.trim();

  const agentIntro = agentName
    ? role
      ? `Sou ${agentName}, ${role}`
      : `Sou ${agentName}`
    : 'Sou o assistente virtual desta empresa';

  const bizName = ctx.businessName?.trim();
  const bizIntro = bizName ? ` da ${bizName}` : '';

  // NOT_STARTED → GREETED: UMA única mensagem (apresentação + convite).
  const greeting =
    `Olá! ${agentIntro}${bizIntro}. ` +
    `Posso te mostrar rapidamente como nossa plataforma pode ajudar sua empresa?`;

  // GREEDED → AWAITING_NAME: UMA única mensagem perguntando o nome.
  const askName = 'Perfeito! Como posso te chamar?';

  const askNameAgain = 'Não entendi seu nome — como posso te chamar?';

  return { greeting, askName, askNameAgain };
}

/** Confirmação curta após capturar o nome (turno AWAITING_NAME → NAME_CAPTURED). */
export function buildNameConfirmedMessage(name: string, options: { useEmoji?: boolean } = {}): string {
  const normalized = name.trim();
  const emoji = options.useEmoji !== false ? ' 😊' : '';
  return `Prazer, ${normalized}!${emoji}`;
}
