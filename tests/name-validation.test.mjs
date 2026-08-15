import test from 'node:test';
import assert from 'node:assert/strict';

import {
  checkNameHeuristic,
  normalizeName,
  validateClientName,
} from '@prospector/ai';

test('heurística rejeita saudações/expressões como nome', () => {
  for (const input of ['boa noite', 'oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'tudo bem', 'blz', 'beleza', 'ok', 'sim', 'não', 'obrigado', 'obrigada', 'valeu']) {
    assert.equal(checkNameHeuristic(input), 'REJECT', `"${input}" deve ser rejeitado`);
  }
});

test('heurística rejeita vazio, só emoji, números e frases longas', () => {
  assert.equal(checkNameHeuristic(''), 'REJECT');
  assert.equal(checkNameHeuristic('   '), 'REJECT');
  assert.equal(checkNameHeuristic('😀😀😀'), 'REJECT');
  assert.equal(checkNameHeuristic('12345'), 'REJECT');
  assert.equal(checkNameHeuristic('maicon 123'), 'REJECT');
  assert.equal(checkNameHeuristic('uma frase muito longa com muitas palavras que nao eh um nome proprio de pessoa'), 'REJECT');
  assert.equal(checkNameHeuristic('quem é você?'), 'REJECT');
});

test('heurística aceita padrão claro de nome (2+ palavras)', () => {
  assert.equal(checkNameHeuristic('João Silva'), 'ACCEPT');
  assert.equal(checkNameHeuristic('Maria da Silva Santos'), 'ACCEPT');
  assert.equal(checkNameHeuristic('Me chamo João Silva'), 'ACCEPT');
  assert.equal(checkNameHeuristic('meu nome é Pedro Henrique'), 'ACCEPT');
});

test('palavra única fora da lista fica UNSURE (usa IA como fallback)', () => {
  assert.equal(checkNameHeuristic('Maicon'), 'UNSURE');
  assert.equal(checkNameHeuristic('carro'), 'UNSURE');
});

test('saudação + nome ainda captura o nome', () => {
  // Nome completo após saudação → ACCEPT
  assert.equal(checkNameHeuristic('boa noite, João Silva'), 'ACCEPT');
  // Nome de uma palavra após saudação → UNSURE (IA decide)
  assert.equal(checkNameHeuristic('boa noite, João'), 'UNSURE');
});

test('normalizeName remove frases introdutórias e capitaliza', () => {
  assert.equal(normalizeName('me chamo maicon'), 'Maicon');
  assert.equal(normalizeName('Meu nome é joão silva'), 'João Silva');
  assert.equal(normalizeName('  prazer, maria  '), 'Maria');
});

test('validateClientName rejeita "boa noite" e não grava como nome', async () => {
  const result = await validateClientName('boa noite');
  assert.equal(result.valid, false);
  assert.equal(result.name, undefined);
});

test('validateClientName aceita nome com fallback de IA quando heurística é UNSURE', async () => {
  const result = await validateClientName('Maicon', { classify: async () => true });
  assert.equal(result.valid, true);
  assert.equal(result.name, 'Maicon');
});

test('validateClientName rejeita via IA quando não é nome', async () => {
  const result = await validateClientName('carro', { classify: async () => false });
  assert.equal(result.valid, false);
  assert.equal(result.name, undefined);
});

test('validateClientName com IA indisponível usa default seguro', async () => {
  // Saudação é rejeitada pela heurística ANTES de qualquer chamada de IA
  const greeting = await validateClientName('boa noite', { classify: async () => { throw new Error('down'); } });
  assert.equal(greeting.valid, false);
  assert.equal(greeting.name, undefined);

  // Nome em 2+ palavras é aceito pela heurística mesmo com IA fora
  const full = await validateClientName('João Silva', { classify: async () => { throw new Error('down'); } });
  assert.equal(full.valid, true);
  assert.equal(full.name, 'João Silva');

  // Palavra única plausível, com IA fora, aceita por fallback seguro
  const single = await validateClientName('Maicon', { classify: async () => { throw new Error('down'); } });
  assert.equal(single.valid, true);
  assert.equal(single.name, 'Maicon');
});
