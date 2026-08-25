/**
 * Seletor de canal da campanha (WHATSAPP / EMAIL / BOTH).
 * Substitui o fallback implícito "e-mail só sem telefone" por escolha explícita.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const { resolveChannelDispatch, CHANNEL_MODES } = await import('@prospector/worker/dist/services/campaign-channels.js');

const LEAD_FULL = { phone: '+5511999999999', email: 'a@b.com' };
const LEAD_SO_PHONE = { phone: '+5511999999999', email: null };
const LEAD_SO_EMAIL = { phone: null, email: 'a@b.com' };
const LEAD_NENHUM = { phone: null, email: null };
const CAP = { whatsapp: 10, email: 10 };

test('modos válidos expostos', () => {
  assert.deepEqual(CHANNEL_MODES, ['WHATSAPP', 'EMAIL', 'BOTH']);
});

test('modo WHATSAPP nunca envia e-mail, mesmo para lead com e-mail', () => {
  assert.deepEqual(resolveChannelDispatch('WHATSAPP', LEAD_FULL, CAP), { whatsapp: true, email: false });
  assert.deepEqual(resolveChannelDispatch('WHATSAPP', LEAD_SO_EMAIL, CAP), { whatsapp: false, email: false });
  assert.deepEqual(resolveChannelDispatch('WHATSAPP', LEAD_NENHUM, CAP), { whatsapp: false, email: false });
});

test('modo EMAIL nunca envia WhatsApp, mesmo para lead com telefone', () => {
  assert.deepEqual(resolveChannelDispatch('EMAIL', LEAD_FULL, CAP), { whatsapp: false, email: true });
  assert.deepEqual(resolveChannelDispatch('EMAIL', LEAD_SO_PHONE, CAP), { whatsapp: false, email: false });
  assert.deepEqual(resolveChannelDispatch('EMAIL', LEAD_NENHUM, CAP), { whatsapp: false, email: false });
});

test('modo BOTH envia pelos dois canais quando o lead tem os dois dados', () => {
  assert.deepEqual(resolveChannelDispatch('BOTH', LEAD_FULL, CAP), { whatsapp: true, email: true });
});

test('modo BOTH usa só o canal disponível quando falta um dos dados', () => {
  assert.deepEqual(resolveChannelDispatch('BOTH', LEAD_SO_PHONE, CAP), { whatsapp: true, email: false });
  assert.deepEqual(resolveChannelDispatch('BOTH', LEAD_SO_EMAIL, CAP), { whatsapp: false, email: true });
  assert.deepEqual(resolveChannelDispatch('BOTH', LEAD_NENHUM, CAP), { whatsapp: false, email: false });
});

test('limites diários de cada canal são respeitados em qualquer modo', () => {
  const capZeroWa = { whatsapp: 0, email: 10 };
  const capZeroEmail = { whatsapp: 10, email: 0 };
  assert.deepEqual(resolveChannelDispatch('BOTH', LEAD_FULL, capZeroWa), { whatsapp: false, email: true });
  assert.deepEqual(resolveChannelDispatch('BOTH', LEAD_FULL, capZeroEmail), { whatsapp: true, email: false });
  assert.deepEqual(resolveChannelDispatch('WHATSAPP', LEAD_FULL, capZeroWa), { whatsapp: false, email: false });
  assert.deepEqual(resolveChannelDispatch('EMAIL', LEAD_FULL, capZeroEmail), { whatsapp: false, email: false });
});
