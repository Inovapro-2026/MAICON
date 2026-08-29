/**
 * Testes da extração de contatos de grupos do WhatsApp (lógica pura).
 *
 * Cobre as garantias legais/operacionais da aba "WhatsApp" da Prospecção:
 *  - JIDs corretas -> telefone E.164; grupo/broadcast/LID -> null;
 *  - admin excluído, próprio contato ignorado, duplicados removidos;
 *  - resumo com encontrados/únicos/duplicados/telefone.
 * A extração NUNCA envia mensagens (não há envio nesta camada).
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  extractContacts,
  phoneFromParticipantJid,
  isGroupOrBroadcastJid,
  isAdminParticipant,
} from "@prospector/whatsapp";

test("phoneFromParticipantJid: converte JID individual em E.164", () => {
  assert.equal(phoneFromParticipantJid("5511987654321@s.whatsapp.net"), "+5511987654321");
  assert.equal(phoneFromParticipantJid("5511987654321"), "+5511987654321");
  assert.equal(phoneFromParticipantJid("5511987654321:8@s.whatsapp.net"), "+5511987654321");
});

test("phoneFromParticipantJid: grupo/broadcast/LID nulos", () => {
  assert.equal(phoneFromParticipantJid("123456789-123456@g.us"), null);
  assert.equal(phoneFromParticipantJid("status@broadcast"), null);
  assert.equal(phoneFromParticipantJid("5511987654321@lid"), null);
  assert.equal(phoneFromParticipantJid(""), null);
  assert.equal(phoneFromParticipantJid(null), null);
});

test("isGroupOrBroadcastJid: identifica grupo/broadcast", () => {
  assert.equal(isGroupOrBroadcastJid("123456789-123456@g.us"), true);
  assert.equal(isGroupOrBroadcastJid("status@broadcast"), true);
  assert.equal(isGroupOrBroadcastJid("5511987654321@s.whatsapp.net"), false);
});

test("isAdminParticipant: detecta admin/superadmin", () => {
  assert.equal(isAdminParticipant({ id: "x", isAdmin: true }), true);
  assert.equal(isAdminParticipant({ id: "x", admin: "admin" }), true);
  assert.equal(isAdminParticipant({ id: "x", admin: "superadmin" }), true);
  assert.equal(isAdminParticipant({ id: "x" }), false);
  assert.equal(isAdminParticipant({ id: "x", admin: "member" }), false);
});

test("extractContacts: extrai nome+telefone e monta resumo", async () => {
  const participants = [
    { id: "5511987654321@s.whatsapp.net", name: "João Silva" },
    { id: "5511999998888@s.whatsapp.net", name: null },
  ];
  const { contacts, summary } = await extractContacts(participants);
  assert.equal(contacts.length, 2);
  assert.equal(contacts[0].phone, "+5511987654321");
  assert.equal(contacts[0].name, "João Silva");
  assert.equal(contacts[1].name, null);
  assert.equal(summary.found, 2);
  assert.equal(summary.unique, 2);
  assert.equal(summary.duplicates, 0);
  assert.equal(summary.phone, 2);
  assert.equal(summary.noPhone, 0);
});

test("extractContacts: exclui admins e o próprio contato", async () => {
  const participants = [
    { id: "5511987654321@s.whatsapp.net", admin: "admin", name: "Admin" },
    { id: "5511900000000@s.whatsapp.net", name: "Eu" },
    { id: "5511977778888@s.whatsapp.net", name: "Cliente" },
  ];
  const { contacts, summary } = await extractContacts(participants, {
    excludeAdmins: true,
    ignoreOwnContact: true,
    ownPhone: "+5511900000000",
  });
  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].name, "Cliente");
  assert.equal(summary.found, 1);
});

test("extractContacts: remove duplicados por telefone (resumo reflete)", async () => {
  const participants = [
    { id: "5511987654321@s.whatsapp.net", name: "A" },
    { id: "5511987654321@s.whatsapp.net", name: "B" },
    { id: "5511987654321:2@s.whatsapp.net", name: "C" },
  ];
  const { contacts, summary } = await extractContacts(participants, {
    removeDuplicates: true,
  });
  assert.equal(contacts.length, 1);
  assert.equal(summary.found, 3);
  assert.equal(summary.unique, 1);
  assert.equal(summary.duplicates, 2);
  assert.equal(summary.phone, 1);
});

test("extractContacts: LID é resolvido via resolveLidPhone", async () => {
  const { contacts, summary } = await extractContacts(
    [{ id: "5511987654321@lid", name: "LID" }],
    { resolveLidPhone: async () => "+5511987654321" },
  );
  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].phone, "+5511987654321");
  assert.equal(summary.phone, 1);
});

test("extractContacts: LID usa o phoneNumber que o servidor devolve na metadata", async () => {
  const participants = [
    { id: "105100000000000@lid", phoneNumber: "5511987654321@s.whatsapp.net", name: "Via PN" },
    { id: "105100000000001@lid", phoneNumber: "5511977778888", username: "Só username" },
  ];
  const { contacts, summary } = await extractContacts(participants);
  assert.equal(contacts.length, 2);
  assert.equal(contacts[0].phone, "+5511987654321");
  assert.equal(contacts[0].name, "Via PN");
  assert.equal(contacts[1].phone, "+5511977778888");
  assert.equal(contacts[1].name, "Só username");
  assert.equal(summary.phone, 2);
  assert.equal(summary.noPhone, 0);
});

test("extractContacts: resolveLidPhone não é chamado quando phoneNumber já resolve", async () => {
  let calls = 0;
  const { contacts } = await extractContacts(
    [{ id: "105100000000000@lid", phoneNumber: "5511987654321@s.whatsapp.net" }],
    { resolveLidPhone: async () => { calls += 1; return null; } },
  );
  assert.equal(contacts[0].phone, "+5511987654321");
  assert.equal(calls, 0);
});

test("extractContacts: LID sem phoneNumber cai no resolveLidPhone (backup)", async () => {
  const { contacts } = await extractContacts(
    [{ id: "105100000000099@lid", name: "Backup" }],
    { resolveLidPhone: async (jid) => (jid.includes("105100000000099") ? "+5511900001111" : null) },
  );
  assert.equal(contacts[0].phone, "+5511900001111");
});

test("extractContacts: sem telefone contabiliza como noPhone e continua no resumo", async () => {
  const { contacts, summary } = await extractContacts([
    { id: "random@lid", name: "Sem telefone" },
  ]);
  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].phone, null);
  assert.equal(summary.phone, 0);
  assert.equal(summary.noPhone, 1);
});