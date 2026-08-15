/**
 * Limpeza total dos dados do Prospector (zera tudo).
 *
 * Preserva:
 *  - Tabela User (login do administrador)
 *  - Tabela Setting (configurações)
 *  - Sessão WhatsApp (pasta /session no disco)
 *
 * Deleta (com FK na ordem correta):
 *  lead, message, conversation, ai_generation, opt_out, delivery_event,
 *  campaign_lead, campaign, lead_import
 *
 * Também limpa as filas REDIS do BullMQ para começar zerado.
 */
import * as dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: join(root, '.env') });

const prisma = new PrismaClient();

const QUEUE_NAMES = [
  'lead-import',
  'campaign-processing',
  'whatsapp-send',
  'email-send',
  'message-received',
  'ai-response',
  'webhook-processing',
  'retry',
  'dead-letter',
];

async function main() {
  console.log('Limpando dados...');

  // Filas em ordem de dependência (filhos primeiro)
  await prisma.deliveryEvent.deleteMany();
  await prisma.aIGeneration.deleteMany();
  await prisma.optOut.deleteMany();
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.campaignLead.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.leadImport.deleteMany();

  const users = await prisma.user.count();
  const settings = await prisma.setting.count();
  console.log(`OK. Users preservados: ${users} | Settings preservados: ${settings}`);

  // Limpa filas REDIS (jobs antigos apontando para leads deletados)
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  console.log('Limpando filas REDIS...');
  for (const name of QUEUE_NAMES) {
    const q = new Queue(name, { connection: { url: redisUrl } });
    try {
      await q.obliterate({ force: true });
      console.log(`  - ${name}: limpa`);
    } catch (e) {
      console.log(`  - ${name}: ${(e).message}`);
    } finally {
      await q.close();
    }
  }
  console.log('Limpeza concluída.');
}

main()
  .catch((err) => {
    console.error('Falha ao limpar:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });