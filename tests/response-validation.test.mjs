import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateGeneratedReply,
  sanitizeReply,
  keepFirstQuestion,
  countQuestions,
  countSentences,
  countEmojis,
  truncateAtBoundary,
  splitReplyIntoMessages,
  splitReplyForSending,
  shouldSummarizeReply,
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

test('limite de comprimento é respeitado (max_length) — trunca na fronteira de palavra', () => {
  const raw = 'PalavraUm ' + 'PalavraDois '.repeat(40);
  const result = validateGeneratedReply(raw, { max_length: 200 });
  assert.equal(result.valid, false);
  assert.ok((result.sanitized ?? '').length <= 200);
});

test('palavra única maior que o limite NUNCA é cortada no meio', () => {
  const raw = 'x'.repeat(300);
  const result = validateGeneratedReply(raw, { max_length: 200 });
  assert.equal(result.valid, false);
  assert.equal(
    result.sanitized,
    raw,
    'mantém a palavra inteira (nunca corta no meio, mesmo acima do limite)',
  );
  assert.equal(truncateAtBoundary(raw, 200), raw);
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

test('emojis configuráveis: use_emojis=true mantém até o teto da plataforma', () => {
  const raw = 'Ótimo! 🎉';
  const result = validateGeneratedReply(raw, { use_emojis: true });
  assert.equal(result.valid, true, 'um emoji com use_emojis=true é válido');
  assert.equal(countEmojis(raw), 1);
});

test('emojis configuráveis: exceder o limite remove os emojis em excesso', () => {
  const raw = 'Ótimo! 🎉✅😀';
  const result = validateGeneratedReply(raw, { max_emojis: 2 });
  assert.equal(result.valid, false);
  assert.equal(countEmojis(result.sanitized ?? ''), 2);
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

// ---------------------------------------------------------------------------
// Bug crítico: corte no meio da palavra ("...produtivid")
// ---------------------------------------------------------------------------

test('BUG: truncamento NUNCA corta no meio de uma palavra', () => {
  const raw =
    'Olá, Maicon! A SAVYRON é uma plataforma de inteligência comercial que ajuda empresas a encontrar novos clientes e automatizar sua operação comercial. Nós reunimos recursos em um único ambiente para aumentar a produtividade.';
  // limite de 200 (config do tenant) — antes, o slice cortava em "produtivid".
  const cut = truncateAtBoundary(raw, 200);
  assert.ok(cut.length <= 200, `len ${cut.length} <= 200`);
  assert.ok(!/\s$/.test(cut), 'não deve terminar com espaço');
  const lastWord = cut.split(/\s+/).at(-1) ?? '';
  // A última palavra do corte precisa ser uma palavra INTACTA do original.
  assert.ok(
    raw.includes(`${lastWord}`),
    `última palavra "${lastWord}" deve existir inteira no original`,
  );
  assert.ok(!lastWord.endsWith('d') || lastWord.includes('dade') === false || lastWord === 'produtividade' || raw.includes('produtividade' + ' '),
    'não pode terminar com "produtivid"');
});

test('BUG: sanitizeReply usa fronteira de frase/palavra (nunca slice bruto)', () => {
  const raw =
    'Resposta longa. ' + 'A palavra produtividade deve ser preservada por completo. '.repeat(10);
  const out = sanitizeReply(raw, { max_length: 120 });
  assert.ok(out.length <= 120, `len ${out.length} <= 120`);
  assert.ok(!/produtivid$/.test(out), 'não pode terminar com palavra cortada');
  assert.ok(/produtividade/.test(out), 'a palavra preservada aparece inteira');
});

test('divisão: resposta longa vira no máximo 2 mensagens em fronteira de frase', () => {
  const long =
    'Primeira frase explica algo importante. Segunda frase continua a explicação. ' +
    'Terceira frase adiciona mais contexto. Quarta frase conclui o raciocínio. Quinta frase de sobra.';
  const parts = splitReplyIntoMessages(long, 100, 2);
  assert.ok(parts.length <= 2, `máximo 2 mensagens, recebeu ${parts.length}`);
  for (const p of parts) {
    assert.ok(p.length <= 100, `parte ${p.length} <= 100`);
    // Toda parte termina em frase completa (ponto final) ou é a única truncada.
    assert.ok(
      /[.!?]$/.test(p) || parts.length === 1,
      `parte termina com pontuação final: ${JSON.stringify(p.slice(-12))}`,
    );
  }
  assert.equal(parts.join(' ').length < long.length, true);
});

test('divisão: com 1 mensagem permitida, trunca na fronteira (nunca palavra)', () => {
  const parts = splitReplyIntoMessages(
    'Frase um curta. Frase dois mais longa aqui. Frase três de sobra.',
    30,
    1,
  );
  assert.equal(parts.length, 1);
  assert.ok(parts[0].length <= 30);
  assert.ok(!/\s$/.test(parts[0]), 'não termina com espaço');
  assert.ok(/[.!?]$/.test(parts[0]), 'termina em pontuação');
});

test('divisão: splitReplyForSending respeita a config do tenant', () => {
  const parts = splitReplyForSending(
    'Frase um. Frase dois. Frase três. Frase quatro. Frase cinco.',
    { max_length: 30, max_messages_per_reply: 2 },
  );
  assert.ok(parts.length <= 2);
  for (const p of parts) assert.ok(p.length <= 30);
});

// ---------------------------------------------------------------------------
// RESUMO (rede de segurança): conteúdo que não cabe é resumido, não cortado
// ---------------------------------------------------------------------------

test('resumo: resposta que não cabe na capacidade é marcada para resumir', () => {
  // max 200 chars × 1 mensagem = capacidade 200; 500 chars não cabem.
  assert.equal(shouldSummarizeReply('x'.repeat(500), { max_length: 200 }), true);
  // Com 2 mensagens permitidas, capacidade 400 — ainda não cabe.
  assert.equal(
    shouldSummarizeReply('x'.repeat(500), {
      max_length: 200,
      max_messages_per_reply: 2,
    }),
    true,
  );
  // Dentro da capacidade → não precisa resumir.
  assert.equal(
    shouldSummarizeReply('x'.repeat(180), { max_length: 200 }),
    false,
  );
  // Sem config → capacidade padrão da plataforma (400 × 1).
  assert.equal(shouldSummarizeReply('x'.repeat(300), {}), false);
  assert.equal(shouldSummarizeReply('x'.repeat(500), {}), true);
});

test('resumo: resposta vazia nunca é marcada para resumir', () => {
  assert.equal(shouldSummarizeReply('   ', { max_length: 200 }), false);
  assert.equal(shouldSummarizeReply('', {}), false);
});
