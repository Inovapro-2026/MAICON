/**
 * Inbox — critério de filtro das abas de Mensagens (/inbox).
 * "Respondido" (padrão) = conversa aberta por IA com nome real coletado;
 * "Em atendimento" = conversa aberta por IA ainda sem nome real ("Novo contato");
 * "Manual" e "Encerradas" mantêm os critérios originais.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
process.env.SESSION_SECRET ??= 'test-secret';
process.env.API_TOKEN ??= 'test-token';

const { buildFilterWhere } = await import('@prospector/api/dist/services/conversation-service.js');
const { PLACEHOLDER_LEAD_NAMES, PLACEHOLDER_LEAD_NAME_PATTERN, hasRealLeadName } = await import('@prospector/utils');

const BID = 'business-1';

// ---------------------------------------------------------------------------
// Fonte única do regex de placeholder (@prospector/utils)
// ---------------------------------------------------------------------------

test('padrão placeholder cobre exatamente as palavras reservadas, sem acento/case', () => {
  for (const word of PLACEHOLDER_LEAD_NAMES) {
    assert.ok(PLACEHOLDER_LEAD_NAME_PATTERN.test(word), `"${word}" deve bater`);
    assert.ok(PLACEHOLDER_LEAD_NAME_PATTERN.test(word.toUpperCase()), `"${word.toUpperCase()}" deve bater`);
  }
  assert.ok(PLACEHOLDER_LEAD_NAME_PATTERN.test('Novo Contato'));
  assert.ok(PLACEHOLDER_LEAD_NAME_PATTERN.test('LEAD'));
});

test('padrão placeholder NÃO trata nomes reais como placeholder', () => {
  for (const name of ['Maicon Silva', 'Clara', 'João', 'Maria da Silva Santos', 'novo contato 2']) {
    assert.equal(PLACEHOLDER_LEAD_NAME_PATTERN.test(name), false, `"${name}" é nome real`);
  }
});

test('hasRealLeadName: nulo/vazio/espaço/placeholder → false; nome real → true', () => {
  for (const bad of [null, undefined, '', '   ', 'Novo contato', 'CONTATO', 'cliente', 'Lead']) {
    assert.equal(hasRealLeadName(bad), false, `${JSON.stringify(bad)} não é nome real`);
  }
  assert.equal(hasRealLeadName('Maicon Silva'), true);
  assert.equal(hasRealLeadName('Clara'), true);
});

// ---------------------------------------------------------------------------
// Critério de cada aba (buildFilterWhere)
// ---------------------------------------------------------------------------

test('aba "responded" (padrão): aberta por IA + nome real obrigatório (não vazio, não placeholder)', () => {
  const where = buildFilterWhere('responded', BID);
  assert.deepEqual(where, {
    status: 'OPEN',
    business_id: BID,
    human_handled: false,
    lead: {
      business_id: BID,
      AND: [{ name: { not: '' } }, { name: { notIn: PLACEHOLDER_LEAD_NAMES, mode: 'insensitive' } }],
    },
  });
});

test('aba "sent": aberta por IA + lead sem nome real (nulo, vazio ou placeholder)', () => {
  const where = buildFilterWhere('sent', BID);
  assert.deepEqual(where, {
    status: 'OPEN',
    business_id: BID,
    human_handled: false,
    lead: {
      business_id: BID,
      OR: [{ name: null }, { name: '' }, { name: { in: PLACEHOLDER_LEAD_NAMES, mode: 'insensitive' } }],
    },
  });
});

test('abas "sent" e "responded" são complementares e excluem atendimento humano', () => {
  const sent = buildFilterWhere('sent', BID);
  const responded = buildFilterWhere('responded', BID);
  assert.equal(sent.status, responded.status, 'ambas só mostram conversas OPEN');
  assert.equal(sent.human_handled, false);
  assert.equal(responded.human_handled, false, 'conversas manuais ficam na aba Manual');
});

test('aba "manual": critério original preservado (OPEN + human_handled)', () => {
  assert.deepEqual(buildFilterWhere('manual', BID), { status: 'OPEN', business_id: BID, human_handled: true });
});

test('aba "closed": critério original preservado (CLOSED)', () => {
  assert.deepEqual(buildFilterWhere('closed', BID), { status: 'CLOSED', business_id: BID });
});

test('fallback "all"/desconhecido: todas as conversas abertas', () => {
  const all = buildFilterWhere('all', BID);
  assert.deepEqual(all, { status: 'OPEN', business_id: BID });
  assert.deepEqual(buildFilterWhere('qualquer', BID), all);
});
