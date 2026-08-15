import test from 'node:test';
import assert from 'node:assert/strict';

// Utilitários de telefone e e-mail (packages/utils -> dist)
import { normalizePhone, isValidPhone, normalizeEmail, isValidEmail, parseCsv, stringifyCsv } from '@prospector/utils';

test('normaliza telefones brasileiros para E.164', () => {
  assert.equal(normalizePhone('(11) 98765-4321'), '+5511987654321');
  assert.equal(normalizePhone('11 98765-4321'), '+5511987654321');
  assert.equal(normalizePhone('+55 11 987654321'), '+5511987654321');
  assert.equal(normalizePhone('5511987654321'), '+5511987654321');
  // Fixo com 9º dígito adicionado
  assert.equal(normalizePhone('11 8765-4321'), '+5511987654321');
  assert.equal(normalizePhone(''), null);
  assert.equal(normalizePhone('abc'), null);
  assert.equal(normalizePhone('11'), null);
});

test('validação de telefone', () => {
  assert.equal(isValidPhone('11987654321'), true);
  assert.equal(isValidPhone('11 9876-5432'), true);
  assert.equal(isValidPhone('11 1234-5678'), false);
});

test('normaliza e-mails', () => {
  assert.equal(normalizeEmail('  Contato@Exemplo.COM '), 'contato@exemplo.com');
  assert.equal(normalizeEmail('inválido'), null);
  assert.equal(normalizeEmail('sem-arroba'), null);
  assert.equal(isValidEmail('a@b.com'), true);
});

test('parser CSV com aspas e vírgulas', () => {
  const csv = 'nome;telefone\n"Barbearia, do João";11987654321\nSalão;21987654321';
  const { headers, rows } = parseCsv(csv, { delimiter: ';', hasHeader: true });
  assert.deepEqual(headers, ['nome', 'telefone']);
  assert.equal(rows.length, 2);
  assert.equal(rows[0][0], 'Barbearia, do João');
});

test('stringify CSV escapa corretamente', () => {
  const out = stringifyCsv(['a', 'b'], [['x,y', 'z"z']]);
  assert.ok(out.includes('"x,y"'));
  assert.ok(out.includes('"z""z"'));
});
