/**
 * Tratamento de links nas mensagens do WhatsApp.
 * Regra: URL nunca vai misturada ao texto — texto primeiro, cada URL em
 * mensagem separada, limpa (sem Markdown), sem duplicatas, qualquer URL.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const { splitUrlsFromMessage, buildOutgoingParts } = await import('@prospector/utils/dist/messages.js');

test('TESTE 1 — URL no fim vira mensagem separada', () => {
  const parts = buildOutgoingParts('Conheça o SAVYRON:\nhttps://crm.inovapro.cloud/vitrine');
  assert.deepEqual(parts, ['Conheça o SAVYRON:', 'https://crm.inovapro.cloud/vitrine']);
});

test('TESTE 2 — link Markdown [texto](url) é desfeito', () => {
  const parts = buildOutgoingParts('Você pode acessar [aqui](https://crm.inovapro.cloud/vitrine).');
  assert.deepEqual(parts, ['Você pode acessar aqui.', 'https://crm.inovapro.cloud/vitrine']);
});

test('TESTE 3 — link de cadastro separado do texto', () => {
  const parts = buildOutgoingParts('Crie sua conta:\nhttps://crm.inovapro.cloud/signup');
  assert.deepEqual(parts, ['Crie sua conta:', 'https://crm.inovapro.cloud/signup']);
});

test('TESTE 4 — mensagem só com URL não gera texto vazio', () => {
  const parts = buildOutgoingParts('https://crm.inovapro.cloud/vitrine');
  assert.deepEqual(parts, ['https://crm.inovapro.cloud/vitrine']);
});

test('TESTE 5 — URL duplicada é enviada uma única vez', () => {
  const parts = buildOutgoingParts('https://crm.inovapro.cloud/vitrine\nhttps://crm.inovapro.cloud/vitrine');
  assert.deepEqual(parts, ['https://crm.inovapro.cloud/vitrine']);
});

test('TESTE 6 — mensagem sem URL passa intacta', () => {
  const original = 'Olá! Como posso ajudar?';
  const result = splitUrlsFromMessage(original);
  assert.equal(result.text, original);
  assert.deepEqual(result.urls, []);
  assert.deepEqual(buildOutgoingParts(original), [original]);
});

test('TESTE 7 — dois links viram três mensagens (texto unido, uma URL por mensagem)', () => {
  const parts = buildOutgoingParts(
    'Conheça a plataforma:\nhttps://crm.inovapro.cloud/vitrine\n\nCrie sua conta:\nhttps://crm.inovapro.cloud/signup'
  );
  assert.deepEqual(parts, [
    'Conheça a plataforma. Crie sua conta.',
    'https://crm.inovapro.cloud/vitrine',
    'https://crm.inovapro.cloud/signup',
  ]);
});

test('bug relatado — Markdown [url](url) não duplica a URL nem vaza sintaxe', () => {
  const input =
    'Claro, Maicon! Aqui está o link para criar sua conta:\n[https://crm.inovapro.cloud/vitrine](https://crm.inovapro.cloud/vitrine).\nO primeiro mês está em promoção por R$ 39,90.';
  const { text, urls } = splitUrlsFromMessage(input);
  assert.ok(!text.includes('[') && !text.includes(']('), 'texto não pode conter Markdown de link');
  assert.equal(text.includes('https://'), false, 'URL não pode ficar no texto');
  assert.deepEqual(urls, ['https://crm.inovapro.cloud/vitrine']);
  const parts = buildOutgoingParts(input);
  assert.deepEqual(parts, [
    'Claro, Maicon! Aqui está o link para criar sua conta. O primeiro mês está em promoção por R$ 39,90.',
    'https://crm.inovapro.cloud/vitrine',
  ]);
});

test('qualquer URL funciona (não é regra exclusiva do SAVYRON)', () => {
  const parts = buildOutgoingParts('Veja: https://google.com e depois https://exemplo.com/pagina.');
  assert.deepEqual(parts, ['Veja: e depois.', 'https://google.com', 'https://exemplo.com/pagina']);
});

test('pontuação grudada na URL é removida (link clicável)', () => {
  const { urls } = splitUrlsFromMessage('Acesse https://exemplo.com/pagina). Obrigado!');
  assert.deepEqual(urls, ['https://exemplo.com/pagina']);
});

test('URL no meio da frase é retirada do texto', () => {
  const { text, urls } = splitUrlsFromMessage(
    'Você pode acessar https://crm.inovapro.cloud/vitrine para conhecer nossos planos e recursos.'
  );
  assert.deepEqual(urls, ['https://crm.inovapro.cloud/vitrine']);
  assert.ok(text.startsWith('Você pode acessar') && text.endsWith('para conhecer nossos planos e recursos.'));
  assert.ok(!text.includes('http'));
});

test('<url> entre sinais também é limpa', () => {
  const { urls } = splitUrlsFromMessage('Link: <https://exemplo.com>');
  assert.deepEqual(urls, ['https://exemplo.com']);
});
