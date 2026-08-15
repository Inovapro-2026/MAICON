import test from 'node:test';
import assert from 'node:assert/strict';

import { parseTextContent } from '@prospector/leads';
import { detectOptOut } from '@prospector/ai';

test('identifica colunas e processa CSV (importador)', () => {
  const csv = [
    'nome;telefone;email;empresa;cidade;estado',
    'Barbearia do João;11 98765-4321;contato@barbeariajoao.com;Barbearia do João;São Paulo;SP',
    'Salão da Maria;21 99876-5432;maria@salao.com;Salão da Maria;Rio de Janeiro;RJ',
    'Telefone inválido;NAO_E_NUMERO;;Studio X;Belo Horizonte;MG',
    'Barbearia do João;11 98765-4321;;Barbearia do João;Campinas;SP',
  ].join('\n');

  const result = parseTextContent(csv, { delimiter: ';' });

  assert.equal(result.summary.total, 4);
  assert.equal(result.summary.newLeads, 2); // 2 novos válidos
  assert.equal(result.summary.invalid, 1); // telefone inválido
  assert.equal(result.summary.duplicates, 1); // duplicado por telefone
});

test('detecta duplicado contra base existente', () => {
  const csv = 'nome;telefone\nOutro Nome;11 98765-4321';
  const result = parseTextContent(csv, {
    delimiter: ';',
    existing: [{ phone: '+5511987654321' }],
  });
  assert.equal(result.summary.duplicates, 1);
  assert.equal(result.summary.newLeads, 0);
});

test('modo teste limita o número de registros', () => {
  const lines = ['nome;telefone'];
  for (let i = 0; i < 20; i += 1) {
    lines.push(`Cliente ${i};${11} 9${String(8765 + i).padStart(4, '0')}-4321`);
  }
  const result = parseTextContent(lines.join('\n'), { delimiter: ';', maxRows: 5 });
  assert.equal(result.summary.total, 5);
});

test('detecção de opt-out por palavras-chave', () => {
  assert.equal(detectOptOut('não quero mais contato'), true);
  assert.equal(detectOptOut('PARE de me mandar mensagem'), true);
  assert.equal(detectOptOut('me tira dessa lista'), true);
  assert.equal(detectOptOut('não tenho interesse'), true);
  assert.equal(detectOptOut('qual o valor?'), false);
});
