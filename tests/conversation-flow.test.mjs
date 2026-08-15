import test from 'node:test';
import assert from 'node:assert/strict';

import {
  decideConversationTurn,
  buildOpeningMessages,
  buildNameConfirmedMessage,
} from '@prospector/ai';

// ---------------------------------------------------------------------------
// Máquina de estados de onboarding — critérios de aceite (TESTES 1 a 5)
// ---------------------------------------------------------------------------

test('TESTE 1 — "Oi" em NOT_STARTED resulta em UMA única mensagem (SEND_GREETING) e avança para GREETED', () => {
  const decision = decideConversationTurn({ stage: 'NOT_STARTED', content: 'Oi' });
  assert.equal(decision.action, 'SEND_GREETING');
  assert.equal(decision.nextStage, 'GREETED');

  // A mensagem enviada é UMA só (a saudação), com no máximo 1 pergunta.
  const msgs = buildOpeningMessages({ agentName: 'SAVYRON IA', businessName: 'SAVYRON' });
  assert.equal(countQuestions(msgs.greeting), 1);
  assert.ok(!/[?].*[?]/.test(msgs.greeting));
});

test('TESTE 2 — resposta afirmativa em GREETED avança para AWAITING_NAME com UMA pergunta', () => {
  for (const reply of ['Sim', 'Claro', 'Pode', 'Quero', 'Sim, quero conhecer']) {
    const decision = decideConversationTurn({ stage: 'GREETED', content: reply });
    assert.equal(decision.action, 'SEND_ASK_NAME', `"${reply}" → SEND_ASK_NAME`);
    assert.equal(decision.nextStage, 'AWAITING_NAME');
  }
  const msgs = buildOpeningMessages({});
  assert.equal(msgs.askName, 'Perfeito! Como posso te chamar?');
  assert.equal(countQuestions(msgs.askName), 1);
});

test('TESTE 3 — "Boa noite" em AWAITING_NAME não vira nome; mantém o estágio', () => {
  const decision = decideConversationTurn({
    stage: 'AWAITING_NAME',
    content: 'Boa noite',
    nameValidation: { valid: false },
  });
  assert.equal(decision.action, 'SEND_ASK_NAME_AGAIN');
  assert.equal(decision.nextStage, undefined, 'estágio não avança');

  const alsoGreeting = decideConversationTurn({
    stage: 'AWAITING_NAME',
    content: 'oi',
    nameValidation: { valid: false },
  });
  assert.equal(alsoGreeting.action, 'SEND_ASK_NAME_AGAIN');
});

test('TESTE 4 — nome válido em AWAITING_NAME captura nome, confirma e avança para NAME_CAPTURED', () => {
  const decision = decideConversationTurn({
    stage: 'AWAITING_NAME',
    content: 'Maicon',
    nameValidation: { valid: true, name: 'Maicon' },
  });
  assert.equal(decision.action, 'SEND_NAME_CONFIRMED');
  assert.equal(decision.nextStage, 'NAME_CAPTURED');
  assert.equal(buildNameConfirmedMessage('Maicon'), 'Prazer, Maicon! 😊');
});

test('TESTE 5 — NAME_CAPTURED libera a IA (PROCEED_TO_AI)', () => {
  const decision = decideConversationTurn({ stage: 'NAME_CAPTURED', content: 'Quero conhecer o plano' });
  assert.equal(decision.action, 'PROCEED_TO_AI');

  // Conversa legada sem estágio também segue para a IA (não refaz onboarding).
  const legacy = decideConversationTurn({ stage: null, content: 'Olá' });
  assert.equal(legacy.action, 'PROCEED_TO_AI');
});

test('GREETED sem resposta afirmativa não avança e não envia (WAIT)', () => {
  for (const reply of ['Oi', 'Boa noite', 'kkkk', 'Tudo bem?', 'Quanto custa?']) {
    const decision = decideConversationTurn({ stage: 'GREETED', content: reply });
    assert.equal(decision.action, 'WAIT', `"${reply}" → WAIT`);
    assert.equal(decision.nextStage, undefined);
  }
});

function countQuestions(text) {
  return (text.match(/\?/g) ?? []).length;
}
