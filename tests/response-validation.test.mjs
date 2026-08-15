import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateGeneratedReply,
  sanitizeReply,
  keepFirstQuestion,
  countQuestions,
  countSentences,
  countEmojis,
} from '@prospector/ai';

// ---------------------------------------------------------------------------
// Validação de SAÍDA do LLM — critérios de aceite (TESTES 6 e 7) + limites
// ---------------------------------------------------------------------------

test('TESTE 6 — resposta com duas perguntas é inválida e sanitizada para a 1ª pergunta', () => {
  const raw = 'Qual é seu segmento? Como consegue clientes?';
  const result = validateGeneratedReply(raw, {});
  assert.equal(result.valid, false);
  assert.ok(result.issues.includes('múltiplas perguntas na mesma resposta'));
  assert.equal(result.sanitized, 'Qual é seu segmento?');
});

test('TESTE 7 — várias frases permanecem UMA mensagem (sem fragmentar)', () => {
  const raw = 'Sim, temos o plano mensal. Ele inclui relatórios completos. Quer que eu te mostre?';
  const result = validateGeneratedReply(raw, {});
  assert.equal(result.valid, true, 'uma pergunta em meio a várias frases é válida');
  assert.equal(result.sanitized, null, 'nada é sanitizado');
  // A mensagem continua inteira (o envio não fragmenta frases).
  assert.equal(countSentences(raw), 3);
});

test('limite de comprimento é respeitado (max_length)', () => {
  const raw = 'x'.repeat(300);
  const result = validateGeneratedReply(raw, { max_length: 200 });
  assert.equal(result.valid, false);
  assert.ok((result.sanitized ?? '').length <= 200);
});

test('limite de frases é respeitado (max_sentences)', () => {
  const raw = 'Frase um. Frase dois. Frase três. Frase quatro. Frase cinco.';
  const result = validateGeneratedReply(raw, { max_sentences: 4 });
  assert.equal(result.valid, false);
  assert.equal(countSentences(result.sanitized ?? ''), 4);
});

test('limite de emojis = 0 remove emojis (max_emojis / use_emojis=false)', () => {
  const raw = 'Ótimo! 🎉✅';
  const result = validateGeneratedReply(raw, { max_emojis: 0 });
  assert.equal(result.valid, false);
  assert.equal(countEmojis(result.sanitized ?? ''), 0);
  assert.equal(countEmojis(sanitizeReply(raw, { use_emojis: false })), 0);
});

test('keepFirstQuestion mantém apenas a 1ª pergunta', () => {
  assert.equal(keepFirstQuestion('A? B? C?'), 'A?');
  assert.equal(keepFirstQuestion('Tem plano? E preço?'), 'Tem plano?');
  assert.equal(keepFirstQuestion('Sem perguntas'), 'Sem perguntas');
});

test('resposta vazia é inválida', () => {
  const result = validateGeneratedReply('  ', {});
  assert.equal(result.valid, false);
});
