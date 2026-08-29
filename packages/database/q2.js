const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const c = await p.campaign.findUnique({
    where: { id: 'cmtassxog0006iilaqo5srgv3' },
    include: {
      _count: { select: { campaign_leads: true } }
    }
  });
  const leads = await p.campaignLead.groupBy({
    by: ['status'],
    where: { campaign_id: 'cmtassxog0006iilaqo5srgv3' },
    _count: true
  });
  console.log('Campaign:', JSON.stringify(c, null, 2));
  console.log('Leads by status:', JSON.stringify(leads, null, 2));
  await p.();
}
main().catch(e => { console.error(e); process.exit(1); });
