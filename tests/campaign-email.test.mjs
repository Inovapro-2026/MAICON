/**
 * Mensagem de e-mail configurável na campanha (canais EMAIL e BOTH).
 * - Assunto/corpo vindos SEMPRE da campanha (email_subject/email_body).
 * - Sem mensagem configurada → nenhum e-mail é disparado (sem fallback fixo).
 * - Variáveis {{nome}}, {{empresa}}, {{email}}, {{telefone}} renderizadas
 *   com os dados de cada lead.
 * - Início bloqueado sem configuração (validação server-side).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const { resolveChannelDispatch, resolveEmailContent } = await import(
  '@prospector/worker/dist/services/campaign-channels.js'
);
const { renderMessageTemplate, validateCampaignEmailConfig, EMAIL_CONFIG_REQUIRED_MSG } = await import(
  '@prospector/utils/dist/misc.js'
);

const LEAD_FULL = {
  name: 'Ana Souza',
  business_name: 'Clinica Bem Viver',
  email: 'ana@bemviver.com.br',
  phone: '+5511999998888',
};

test('renderMessageTemplate substitui as quatro variáveis com dados do lead', () => {
  const out = renderMessageTemplate('Olá {{nome}}, tudo bem? Falo da {{empresa}}. Responda em {{email}} ou {{telefone}}.', LEAD_FULL);
  assert.equal(out, 'Olá Ana Souza, tudo bem? Falo da Clinica Bem Viver. Responda em ana@bemviver.com.br ou +5511999998888.');
});

test('renderMessageTemplate remove variáveis sem dado correspondente', () => {
  const out = renderMessageTemplate('Olá {{nome}} da {{empresa}}!', { name: 'Ana', business_name: null });
  assert.equal(out, 'Olá Ana da !');
});

test('resolveEmailContent usa exatamente assunto e mensagem configurados (renderizados)', () => {
  const content = resolveEmailContent(
    { email_subject: 'Solução para a {{empresa}}', email_body: 'Olá {{nome}}, tudo bem?' },
    LEAD_FULL
  );
  assert.deepEqual(content, { subject: 'Solução para a Clinica Bem Viver', body: 'Olá Ana Souza, tudo bem?' });
});

test('resolveEmailContent retorna null sem assunto (campanha antiga não envia e-mail)', () => {
  assert.equal(resolveEmailContent({ email_subject: null, email_body: 'corpo' }, LEAD_FULL), null);
});

test('resolveEmailContent retorna null sem mensagem', () => {
  assert.equal(resolveEmailContent({ email_subject: 'Assunto', email_body: null }, LEAD_FULL), null);
});

test('resolveEmailContent retorna null com campos vazios/só espaços', () => {
  assert.equal(resolveEmailContent({ email_subject: '  ', email_body: 'x' }, LEAD_FULL), null);
  assert.equal(resolveEmailContent({ email_subject: 'x', email_body: '' }, LEAD_FULL), null);
});

test('campanha WHATSAPP não mostra/exige config de e-mail (validação passa sem config)', () => {
  assert.equal(validateCampaignEmailConfig('WHATSAPP', null, null), null);
});

test('EMAIL sem assunto não pode iniciar', () => {
  const err = validateCampaignEmailConfig('EMAIL', '', 'corpo');
  assert.equal(err, EMAIL_CONFIG_REQUIRED_MSG);
});

test('EMAIL sem mensagem não pode iniciar', () => {
  const err = validateCampaignEmailConfig('EMAIL', 'assunto', null);
  assert.equal(err, EMAIL_CONFIG_REQUIRED_MSG);
});

test('BOTH exige as duas partes da mensagem', () => {
  assert.equal(validateCampaignEmailConfig('BOTH', 'a', ''), EMAIL_CONFIG_REQUIRED_MSG);
  assert.equal(validateCampaignEmailConfig('BOTH', 'a', 'b'), null);
});

test('EMAIL/BOTH configurados podem iniciar', () => {
  assert.equal(validateCampaignEmailConfig('EMAIL', 'Assunto', 'Mensagem'), null);
  assert.equal(validateCampaignEmailConfig('BOTH', 'Assunto', 'Mensagem'), null);
});

test('WHATSAPP nunca despacha e-mail; EMAIL nunca despacha WhatsApp (destinatários inalterados)', () => {
  const cap = { whatsapp: 10, email: 10 };
  assert.deepEqual(resolveChannelDispatch('WHATSAPP', LEAD_FULL, cap), { whatsapp: true, email: false });
  assert.deepEqual(resolveChannelDispatch('EMAIL', LEAD_FULL, cap), { whatsapp: false, email: true });
});

test('BOTH despacha os dois canais quando o lead tem telefone e e-mail', () => {
  assert.deepEqual(resolveChannelDispatch('BOTH', LEAD_FULL, { whatsapp: 10, email: 10 }), {
    whatsapp: true,
    email: true,
  });
});
