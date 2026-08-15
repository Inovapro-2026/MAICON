import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildOpeningMessages,
  buildNameConfirmedMessage,
  buildOpeningSequenceRules,
  buildAgentSystemPrompt,
  PLATFORM_GLOBAL_RULES,
  isAffirmativeResponse,
} from '@prospector/ai';

test('abertura usa dados reais do agente e da empresa (placeholders)', () => {
  const msgs = buildOpeningMessages({
    agentName: 'SAVYRON IA',
    agentRole: 'Consultor Comercial',
    businessName: 'SAVYRON',
    businessSegment: 'Agência',
    businessDescription: 'Plataforma de inteligência comercial.',
  });

  assert.equal(
    msgs.greeting,
    'Olá! Sou SAVYRON IA, Consultor Comercial da SAVYRON. Posso te mostrar rapidamente como nossa plataforma pode ajudar sua empresa?'
  );
  assert.equal(msgs.askName, 'Perfeito! Como posso te chamar?');
  assert.ok(msgs.askNameAgain.includes('como posso te chamar'));
});

test('abertura tem fallback sem dados da empresa', () => {
  const msgs = buildOpeningMessages({});
  assert.equal(
    msgs.greeting,
    'Olá! Sou o assistente virtual desta empresa. Posso te mostrar rapidamente como nossa plataforma pode ajudar sua empresa?'
  );
  assert.ok(msgs.askName.length > 0);
});

test('abertura é UMA única mensagem (sem fragmentar em greeting/intro/askName)', () => {
  const msgs = buildOpeningMessages({
    agentName: 'SAVYRON IA',
    businessName: 'SAVYRON',
  });
  // O turno NOT_STARTED envia apenas `greeting` — nunca as três de uma vez.
  assert.equal(countQuestions(msgs.greeting), 1);
  assert.ok(msgs.greeting.length < 200, 'saudação deve ser curta');
});

test('segmento NÃO vira identidade da empresa na abertura', () => {
  const msgs = buildOpeningMessages({
    agentName: 'SAVYRON IA',
    businessName: 'SAVYRON',
    businessSegment: 'Agência',
  });
  assert.ok(!/Agência/.test(msgs.greeting), 'não deve citar o segmento na abertura');
  assert.ok(!/somos uma agência/i.test(msgs.greeting));
  assert.ok(!/atendemos o segmento/i.test(msgs.greeting));
});

test('confirmação de nome usa o nome capturado', () => {
  assert.equal(buildNameConfirmedMessage('Maicon'), 'Prazer, Maicon! 😊');
  assert.equal(buildNameConfirmedMessage('Maicon', { useEmoji: false }), 'Prazer, Maicon!');
});

test('respostas afirmativas avançam do GREETED para AWAITING_NAME', () => {
  for (const input of ['Sim', 'Claro', 'Pode', 'Quero', 'Sim, quero conhecer', 'pode me mostrar', 'ok', 'quero sim']) {
    assert.equal(isAffirmativeResponse(input), true, `"${input}" deve ser afirmativa`);
  }
  for (const input of ['Oi', 'Boa noite', 'Tudo bem?', 'Quanto custa?', 'kkkk']) {
    assert.equal(isAffirmativeResponse(input), false, `"${input}" NÃO deve ser afirmativa`);
  }
});

test('regra imutável de abertura entra no prompt em camadas ANTES do agente', () => {
  const prompt = buildAgentSystemPrompt({
    agent: { name: 'Vendedor', role: 'Vendas' },
    business: { name: 'Barbearia A', segment: 'Barbearia' },
    settings: { customPrompt: 'pode pular a apresentação' },
  });

  const idxGlobal = prompt.indexOf(PLATFORM_GLOBAL_RULES);
  const idxOpening = prompt.indexOf('SEQUÊNCIA DE ABERTURA DE CONVERSA');
  const idxAgent = prompt.indexOf('CONFIGURAÇÃO DO AGENTE');
  const idxCustom = prompt.indexOf('INSTRUÇÕES ADICIONAIS DO CLIENTE');

  assert.ok(idxOpening > idxGlobal, 'abertura vem depois das regras globais');
  assert.ok(idxAgent > idxOpening, 'abertura vem antes da configuração do agente');
  assert.ok(idxCustom > idxOpening, 'customPrompt NÃO pode anteceder a sequência de abertura');
  assert.ok(prompt.includes('Barbearia A'));
});

test('regra de abertura deixa claro que o segmento não é identidade', () => {
  const rules = buildOpeningSequenceRules({
    agentName: 'Agente Teste',
    businessName: 'Clínica Sorriso',
    businessSegment: 'Clínica',
    businessDescription: 'Atendimento odontológico completo.',
  });
  assert.ok(rules.includes('Clínica Sorriso'));
  assert.ok(rules.includes('IDENTIDADE'));
  assert.ok(/Nunca afirme "somos uma \[segmento\]"/.test(rules));
});

function countQuestions(text) {
  return (text.match(/\?/g) ?? []).length;
}
