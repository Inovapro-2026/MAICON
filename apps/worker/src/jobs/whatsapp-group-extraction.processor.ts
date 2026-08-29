/**
 * Processador da fila WHATSAPP_GROUP_EXTRACTION.
 *
 * Extrai contatos de participantes de grupos do WhatsApp usando a MESMA sessão
 * Baileys da empresa (nunca abre uma segunda conexão). Os contatos são
 * deduplicados (por telefone, incluindo contra a base existente), viram leads
 * com source WHATSAPP_GROUP e — dependendo do destino escolhido — podem entrar
 * na campanha da empresa (respeitando a regra de 1 campanha por empresa).
 *
 * GARANTIA LEGAL: a extração NUNCA envia mensagens. Campanha alvo nasce/fica
 * PAUSED (nada é disparado até o usuário revisar e ativar). Opt-outs continuam
 * sendo respeitados no envio (campaign.processor).
 */
import { prisma } from '@prospector/database';
import { createLogger } from '@prospector/logger';
import { QUEUE_NAMES } from '@prospector/queues';
import { ExtractedContact, extractContacts, getWhatsAppManager } from '@prospector/whatsapp';
import { getWorkerQueue } from '../queues';
import { buildWhatsAppGroupProgressEvent, publishRealtime } from '../services/realtime';

const logger = createLogger('worker.whatsapp-group-extraction');

export interface WhatsAppGroupExtractionJobData {
  extractionId: string;
  businessId: string;
}

export async function processWhatsAppGroupExtraction(job: {
  id?: string;
  data: WhatsAppGroupExtractionJobData;
}): Promise<void> {
  const { extractionId, businessId } = job.data;
  const jobId = String(job.id ?? '');

  const extraction = await prisma.whatsAppGroupExtraction.findFirst({
    where: { id: extractionId, business_id: businessId },
  });
  if (!extraction) {
    logger.warn('Extração não encontrada; job ignorado', { extraction_id: extractionId, jobId });
    return;
  }
  if (extraction.status === 'COMPLETED' || extraction.status === 'FAILED') {
    logger.debug('Extração já finalizada; job ignorado', { extraction_id: extractionId });
    return;
  }

  await prisma.whatsAppGroupExtraction.update({
    where: { id: extractionId },
    data: { status: 'RUNNING', started_at: new Date() },
  });

  const manager = getWhatsAppManager(businessId);

  try {
    if (!manager.isConnected()) {
      throw new Error(
        'WhatsApp não está conectado. Conecte em Configurações (QR code) antes de extrair contatos.',
      );
    }

    const ownPhone = manager.getOwnPhone();

    // 1) Busca os participantes de cada grupo selecionado (mesma sessão).
    const groups: Array<{
      jid: string;
      subject: string;
      contacts: ExtractedContact[];
      participantCount: number;
    }> = [];
    const phoneToContact = new Map<string, ExtractedContact>();
    const phoneToGroups = new Map<string, Set<string>>();
    const noPhoneContacts: ExtractedContact[] = [];
    let rawFound = 0;

    for (const jid of extraction.group_ids ?? []) {
      const meta = await manager.fetchGroupMetadata(jid);
      const participants = meta?.participants ?? [];
      const subject =
        typeof meta?.subject === 'string' && meta.subject ? meta.subject : jid;

      const { contacts } = await extractContacts(participants, {
        excludeAdmins: extraction.exclude_admins,
        ignoreOwnContact: extraction.ignore_own_contact,
        ownPhone,
        removeDuplicates: extraction.remove_duplicates,
        resolveLidPhone: manager.resolvePhoneFromLid.bind(manager),
      });

      rawFound += contacts.length;
      for (const c of contacts) {
        if (c.phone) {
          phoneToContact.set(c.phone, c);
          const set = phoneToGroups.get(c.phone) ?? new Set<string>();
          set.add(jid);
          phoneToGroups.set(c.phone, set);
        } else {
          noPhoneContacts.push(c);
        }
      }

      await prisma.whatsAppGroupSource.upsert({
        where: {
          extraction_id_group_identifier: { extraction_id: extractionId, group_identifier: jid },
        },
        update: { group_name: subject, participant_count: participants.length },
        create: {
          business_id: businessId,
          extraction_id: extractionId,
          group_identifier: jid,
          group_name: subject,
          participant_count: participants.length,
        },
      });
      groups.push({ jid, subject, contacts, participantCount: participants.length });
    }

    // 2) Únicos globais (dedup entre grupos) + contagem final.
    const uniquePhoneContacts = [...phoneToContact.values()];
    const uniqueContacts = [...uniquePhoneContacts, ...noPhoneContacts];
    const uniqueCount = uniqueContacts.length;
    const duplicateCount = Math.max(0, rawFound - uniqueCount);
    const phoneCount = uniquePhoneContacts.length;

    // 3) Dedup contra a base existente (mesmo mecanismo de fingerprint_phone).
    const phones = uniquePhoneContacts.map((c) => c.phone as string);
    const existing = await prisma.lead.findMany({
      where: { business_id: businessId, fingerprint_phone: { in: phones } },
      select: { id: true, fingerprint_phone: true },
    });
    const existingByPhone = new Map(
      existing.map((l) => [l.fingerprint_phone as string, l.id]),
    );
    const newContacts = uniquePhoneContacts.filter(
      (c) => !existingByPhone.has(c.phone as string),
    );

    // 4) Cria os leads novos (source WHATSAPP_GROUP).
    let newLeadIds: string[] = [];
    if (newContacts.length > 0) {
      await prisma.lead.createMany({
        data: newContacts.map((c) => ({
          business_id: businessId,
          name: c.name,
          phone: c.phone as string,
          source: 'WHATSAPP_GROUP' as const,
          status: 'PENDING' as const,
          fingerprint_phone: c.phone as string,
        })),
        skipDuplicates: true,
      });
      const created = await prisma.lead.findMany({
        where: {
          business_id: businessId,
          fingerprint_phone: { in: newContacts.map((c) => c.phone as string) },
        },
        select: { id: true, fingerprint_phone: true },
      });
      newLeadIds = created.map((l) => l.id);
    }

    const allLeadIds = [...existing.map((l) => l.id), ...newLeadIds];

    // Mapa telefone -> lead (baseados + novos) para os vínculos de grupo.
    const leadIdByPhone = new Map<string, string>();
    for (const l of existing) {
      if (l.fingerprint_phone) leadIdByPhone.set(l.fingerprint_phone, l.id);
    }
    const created = await prisma.lead.findMany({
      where: {
        business_id: businessId,
        fingerprint_phone: { in: newContacts.map((c) => c.phone as string) },
      },
      select: { id: true, fingerprint_phone: true },
    });
    for (const l of created) {
      if (l.fingerprint_phone) leadIdByPhone.set(l.fingerprint_phone, l.id);
    }

    // 5) Vincula participantes a cada grupo (WhatsAppGroupLead).
    const links: Array<{ business_id: string; source_id: string; lead_id: string }> = [];
    const sourceByJid = await prisma.whatsAppGroupSource.findMany({
      where: { extraction_id: extractionId },
      select: { id: true, group_identifier: true },
    });
    const sourceIdByJid = new Map(sourceByJid.map((s) => [s.group_identifier, s.id]));

    for (const jid of sourceIdByJid.keys()) {
      const gids = [...phoneToGroups.entries()]
        .filter(([, set]) => set.has(jid))
        .map(([phone]) => phone)
        .map((phone) => leadIdByPhone.get(phone))
        .filter((id): id is string => Boolean(id));
      const sourceId = sourceIdByJid.get(jid);
      if (sourceId) {
        for (const lid of gids) {
          links.push({ business_id: businessId, source_id: sourceId, lead_id: lid });
        }
      }
    }

    // 6) Enriquecimento (opcional): leads com site vão para LEAD_ENRICHMENT.
    let enrichedCount = 0;
    const shouldEnrich =
      extraction.auto_enrich || extraction.destination === 'enrich' || extraction.destination === 'campaign';
    if (shouldEnrich && newLeadIds.length > 0) {
      const withWebsite = await prisma.lead.findMany({
        where: { business_id: businessId, id: { in: newLeadIds }, website: { not: null } },
        select: { id: true, website: true },
      });
      for (const lead of withWebsite) {
        if (!lead.website) continue;
        await getWorkerQueue(QUEUE_NAMES.LEAD_ENRICHMENT).add(
          'enrich',
          { leadId: lead.id, businessId, website: lead.website },
          { jobId: `enrich-${lead.id}`, removeOnComplete: true },
        );
        enrichedCount += 1;
      }
    }

    // 7) Destino "campaign": associa aos leads a campanha da empresa
    //    (1 campanha por empresa). Cria apenas se não existir nenhuma; a
    //    campanha nasce PAUSED — nenhuma mensagem é disparada automaticamente.
    let campaignId = extraction.campaign_id ?? null;
    if (extraction.destination === 'campaign' && allLeadIds.length > 0) {
      const existingCampaign = await prisma.campaign.findFirst({
        where: { business_id: businessId },
        orderBy: { created_at: 'asc' },
        select: { id: true },
      });
      if (existingCampaign) {
        campaignId = existingCampaign.id;
      } else {
        const groupName = groups[0]?.subject ?? 'Grupos selecionados';
        const settings = await prisma.businessSettings.findFirst({
          where: { business_id: businessId },
        });
        const campaign = await prisma.campaign.create({
          data: {
            business_id: businessId,
            name: `WhatsApp — ${groupName}`.slice(0, 190),
            status: 'PAUSED',
            daily_whatsapp_limit: settings?.whatsapp_daily_limit ?? 30,
            daily_email_limit: settings?.email_daily_limit ?? 100,
            interval_seconds: settings?.interval_seconds ?? 7200,
          },
        });
        campaignId = campaign.id;
      }
      await prisma.campaignLead.createMany({
        data: allLeadIds.map((leadId) => ({
          business_id: businessId,
          campaign_id: campaignId as string,
          lead_id: leadId,
          status: 'PENDING' as const,
        })),
        skipDuplicates: true,
      });
    }

    // 8) Persiste contagens e finaliza.
    if (links.length > 0) {
      await prisma.whatsAppGroupLead.createMany({ data: links, skipDuplicates: true });
    }
    const qualifiedCount = phoneCount;

    await prisma.whatsAppGroupExtraction.update({
      where: { id: extractionId },
      data: {
        status: 'COMPLETED',
        campaign_id: campaignId,
        found_count: rawFound,
        unique_count: uniqueCount,
        duplicate_count: duplicateCount,
        phone_count: phoneCount,
        enriched_count: enrichedCount,
        qualified_count: qualifiedCount,
        completed_at: new Date(),
      },
    });

    publishRealtime(
      buildWhatsAppGroupProgressEvent({
        businessId,
        extractionId,
        progress: {
          found: rawFound,
          unique: uniqueCount,
          duplicates: duplicateCount,
          phone: phoneCount,
          enriched: enrichedCount,
          qualified: qualifiedCount,
        },
      }),
    );

    logger.info('Extração de grupo(s) do WhatsApp concluída', {
      extraction_id: extractionId,
      business_id: businessId,
      groups: groups.length,
      found: rawFound,
      unique: uniqueCount,
      duplicates: duplicateCount,
      new_leads: newLeadIds.length,
      campaign_id: campaignId ?? undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.whatsAppGroupExtraction.update({
      where: { id: extractionId },
      data: { status: 'FAILED', error_message: message, completed_at: new Date() },
    });
    publishRealtime(
      buildWhatsAppGroupProgressEvent({
        businessId,
        extractionId,
        error: message,
      }),
    );
    logger.error('Falha na extração de contatos de grupo', {
      extraction_id: extractionId,
      business_id: businessId,
      error: message,
    });
    throw error;
  }
}