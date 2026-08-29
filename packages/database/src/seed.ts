/**
 * Seed: cria o usuário administrador padrão, a empresa padrão "SAVYRON",
 * a associação (membership) do admin como OWNER e as configurações iniciais da empresa.
 * Uso: npm run db:seed (a partir da raiz do projeto)
 */
import * as dotenv from "dotenv";
import { join } from "path";
dotenv.config({ path: join(__dirname, "..", "..", "..", ".env") });

import {
  PrismaClient,
  BusinessRole,
  BusinessStatus,
  UserRole,
} from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "ceo.inovapro@maicon";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Inovapro$2026";

export const DEFAULT_BUSINESS_ID = "cin_default_agendacorte";
export const DEFAULT_BUSINESS_SLUG = "agendacorte";
export const DEFAULT_BUSINESS_NAME = "SAVYRON";

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { password_hash: passwordHash, platform_role: "PLATFORM_ADMIN" },
    create: {
      email: ADMIN_EMAIL,
      password_hash: passwordHash,
      name: "Administrador",
      role: UserRole.ADMIN,
      platform_role: "PLATFORM_ADMIN",
      must_change_password: true,
    },
  });

  const business = await prisma.business.upsert({
    where: { slug: DEFAULT_BUSINESS_SLUG },
    update: { name: DEFAULT_BUSINESS_NAME, status: BusinessStatus.ACTIVE },
    create: {
      id: DEFAULT_BUSINESS_ID,
      name: DEFAULT_BUSINESS_NAME,
      slug: DEFAULT_BUSINESS_SLUG,
      status: BusinessStatus.ACTIVE,
    },
  });

  await prisma.businessMember.upsert({
    where: {
      business_id_user_id: { business_id: business.id, user_id: admin.id },
    },
    update: { role: BusinessRole.OWNER },
    create: {
      business_id: business.id,
      user_id: admin.id,
      role: BusinessRole.OWNER,
    },
  });

  const ws = Number(process.env.DEFAULT_WHATSAPP_DAILY_LIMIT || "30");
  const em = Number(process.env.DEFAULT_EMAIL_DAILY_LIMIT || "100");
  const iv = Number(process.env.DEFAULT_INTERVAL_SECONDS || "7200");
  const tm = Number(process.env.TEST_MODE_MAX_LEADS || "5");

  await prisma.businessSettings.upsert({
    where: { business_id: business.id },
    update: {
      whatsapp_daily_limit: ws,
      email_daily_limit: em,
      interval_seconds: iv,
      test_mode_max_leads: tm,
    },
    create: {
      business_id: business.id,
      whatsapp_daily_limit: ws,
      email_daily_limit: em,
      interval_seconds: iv,
      test_mode_max_leads: tm,
    },
  });

  // A IA conduz a conversa de forma dinâmica (sem sequência fixa de abertura):
  // a configuração de onboarding foi removida — nada a setar aqui. O comportamento
  // é guiado pela Descrição da empresa + Base de conhecimento + memória.

  const settings = {
    default_whatsapp_daily_limit: String(ws),
    default_email_daily_limit: String(em),
    default_interval_seconds: String(iv),
    test_mode: String(tm),
  };

  for (const [key, value] of Object.entries(settings)) {
    await prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  const defaultPlans = [
    {
      name: "Inicial",
      slug: "initial",
      description: "Para começar a usar o SAVYRON",
      price: 0,
      sort_order: 0,
      stripe_product_id: "prod_V3tHc8ZQxy2wCX",
      stripe_price_id: null,
    },
    {
      name: "Profissional",
      slug: "professional",
      description: "Tudo para crescer sua operação comercial",
      price: 39.9,
      sort_order: 1,
      stripe_product_id: "prod_V3tHZ3UXY6Dz8z",
      stripe_price_id: "price_1U3lVPLWyC4uRc8x0g0nrcps",
    },
    {
      name: "Empresa",
      slug: "enterprise",
      description: "Para equipes maiores e automações avançadas",
      price: 99.9,
      sort_order: 2,
      stripe_product_id: "prod_V3tHLB99MLu9iM",
      stripe_price_id: "price_1U3lVTLWyC4uRc8xeUTblCms",
    },
  ];

  const planFeatures: Array<{ feature: string; limit?: number }> = [
    { feature: "max_users" },
    { feature: "max_contacts" },
    { feature: "max_conversations" },
    { feature: "max_messages" },
    { feature: "max_agents" },
    { feature: "max_whatsapp_connections" },
    { feature: "max_automations" },
    { feature: "max_knowledge_items" },
    { feature: "max_storage" },
    { feature: "max_ai_usage" },
  ];

  // Prospecção web (busca automática de leads) — habilitada APENAS no plano
  // Empresa. A validação é feita por feature do plano (nunca hardcodando o slug).
  const plansWithProspeccaoWeb = new Set(["enterprise"]);
  // Extração de contatos de grupos do WhatsApp — Empresa (mesmo plano da prospecção web).
  const plansWithWhatsAppGroups = new Set(["enterprise"]);

  for (const planData of defaultPlans) {
    const plan = await prisma.plan.upsert({
      where: { slug: planData.slug },
      update: {
        name: planData.name,
        description: planData.description,
        price: planData.price,
        active: planData.price > 0, // plano grátis fica desativado (sem plano free no cadastro)
        sort_order: planData.sort_order,
        stripe_product_id: planData.stripe_product_id ?? null,
        stripe_price_id: planData.stripe_price_id ?? null,
      },
      create: {
        name: planData.name,
        slug: planData.slug,
        description: planData.description,
        price: planData.price,
        billing_interval: "MONTHLY",
        active: planData.price > 0,
        sort_order: planData.sort_order,
        stripe_product_id: planData.stripe_product_id ?? null,
        stripe_price_id: planData.stripe_price_id ?? null,
      },
    });
    for (const f of planFeatures) {
      await prisma.planFeature.upsert({
        where: { plan_id_feature: { plan_id: plan.id, feature: f.feature } },
        update: { enabled: true, limit: f.limit ?? null },
        create: {
          plan_id: plan.id,
          feature: f.feature,
          enabled: true,
          limit: f.limit ?? null,
        },
      });
    }
    // Feature de prospecção web: só no plano Empresa.
    const webEnabled = plansWithProspeccaoWeb.has(planData.slug);
    await prisma.planFeature.upsert({
      where: {
        plan_id_feature: { plan_id: plan.id, feature: "prospeccao_web" },
      },
      update: { enabled: webEnabled, limit: null },
      create: {
        plan_id: plan.id,
        feature: "prospeccao_web",
        enabled: webEnabled,
        limit: null,
      },
    });
    // Extração de grupos do WhatsApp: só no plano Empresa.
    const whatsappGroupsEnabled = plansWithWhatsAppGroups.has(planData.slug);
    await prisma.planFeature.upsert({
      where: {
        plan_id_feature: {
          plan_id: plan.id,
          feature: "whatsapp_group_extraction",
        },
      },
      update: { enabled: whatsappGroupsEnabled, limit: null },
      create: {
        plan_id: plan.id,
        feature: "whatsapp_group_extraction",
        enabled: whatsappGroupsEnabled,
        limit: null,
      },
    });
  }

  console.log(`Empresa padrão pronta: ${business.name} (${business.slug})`);
  console.log(
    `Admin pronto: ${admin.email} (deve trocar a senha no primeiro acesso)`,
  );
  console.log("Configurações padrão gravadas.");
  console.log("Planos padrão gravados.");
}

main()
  .catch((err) => {
    console.error("Falha no seed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
