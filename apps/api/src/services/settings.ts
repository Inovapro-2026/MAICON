import { prisma } from '@prospector/database';

export async function getSetting(key: string): Promise<string | null> {
  const setting = await prisma.setting.findUnique({ where: { key } });
  return setting?.value ?? null;
}

export async function getSettingInt(key: string, fallback: number): Promise<number> {
  const value = await getSetting(key);
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await prisma.setting.findMany();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function getBusinessSettings(businessId: string) {
  return prisma.businessSettings.findUnique({ where: { business_id: businessId } });
}

export interface BusinessSettingsPatch {
  whatsapp_daily_limit?: number;
  email_daily_limit?: number;
  interval_seconds?: number;
  address?: string | null;
  website?: string | null;
  instagram?: string | null;
  opening_hours?: string | null;
  timezone?: string;
  logo_url?: string | null;
  additional_info?: string | null;
}

export async function setBusinessSettings(
  businessId: string,
  data: BusinessSettingsPatch
): Promise<void> {
  await prisma.businessSettings.upsert({
    where: { business_id: businessId },
    update: {
      ...(data.whatsapp_daily_limit !== undefined ? { whatsapp_daily_limit: data.whatsapp_daily_limit } : {}),
      ...(data.email_daily_limit !== undefined ? { email_daily_limit: data.email_daily_limit } : {}),
      ...(data.interval_seconds !== undefined ? { interval_seconds: data.interval_seconds } : {}),
      ...(data.address !== undefined ? { address: data.address } : {}),
      ...(data.website !== undefined ? { website: data.website } : {}),
      ...(data.instagram !== undefined ? { instagram: data.instagram } : {}),
      ...(data.opening_hours !== undefined ? { opening_hours: data.opening_hours } : {}),
      ...(data.timezone !== undefined ? { timezone: data.timezone } : {}),
      ...(data.logo_url !== undefined ? { logo_url: data.logo_url } : {}),
      ...(data.additional_info !== undefined ? { additional_info: data.additional_info } : {}),
    },
    create: {
      business_id: businessId,
      ...(data.whatsapp_daily_limit !== undefined ? { whatsapp_daily_limit: data.whatsapp_daily_limit } : {}),
      ...(data.email_daily_limit !== undefined ? { email_daily_limit: data.email_daily_limit } : {}),
      ...(data.interval_seconds !== undefined ? { interval_seconds: data.interval_seconds } : {}),
      ...(data.address !== undefined ? { address: data.address } : {}),
      ...(data.website !== undefined ? { website: data.website } : {}),
      ...(data.instagram !== undefined ? { instagram: data.instagram } : {}),
      ...(data.opening_hours !== undefined ? { opening_hours: data.opening_hours } : {}),
      ...(data.timezone !== undefined ? { timezone: data.timezone } : {}),
      ...(data.logo_url !== undefined ? { logo_url: data.logo_url } : {}),
      ...(data.additional_info !== undefined ? { additional_info: data.additional_info } : {}),
    },
  });
}

export async function getBusinessSettingInt(businessId: string, key: string, fallback: number): Promise<number> {
  const settings = await getBusinessSettings(businessId);
  const value = settings?.[key as keyof typeof settings];
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}
