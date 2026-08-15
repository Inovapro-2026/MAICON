"use client";

interface ApiResult<T> {
  success: boolean;
  data?: T;
  error?: { code?: string; message?: string };
}

/** Chamada pública (sem sessão) ao proxy onboarding do dashboard. */
async function publicCall<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<{ status: number; data: ApiResult<T> }> {
  const res = await fetch(path, {
    method,
    headers:
      body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data: ApiResult<T> = { success: false };
  // Lê o corpo como texto primeiro: se não for JSON, preserva a mensagem real
  // do servidor (evita "Falha ao ler resposta" sem informação útil).
  const raw = await res.text();
  try {
    data = raw ? (JSON.parse(raw) as ApiResult<T>) : { success: false };
  } catch {
    data = {
      success: false,
      error: {
        code: "PARSE",
        message: raw?.slice(0, 200) || `Erro HTTP ${res.status}`,
      },
    };
  }
  return { status: res.status, data };
}

export interface OnboardingPlan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  billingInterval: string;
  trialDays: number;
  features: { feature: string; enabled: boolean; limit: number | null }[];
}

export interface SignupResult {
  token: string;
  active_business: { id: string; status: string };
  requires_payment: boolean;
}

export async function fetchPlans(): Promise<OnboardingPlan[]> {
  const { data } = await publicCall<{ plans: OnboardingPlan[] }>(
    "/api/proxy/auth/plans",
  );
  if (data?.success && data.data) return data.data.plans;
  return [];
}

export async function requestVerificationCode(email: string): Promise<void> {
  const { status, data } = await publicCall(
    "/api/proxy/auth/send-code",
    "POST",
    { email },
  );
  if (status !== 200 || !data.success) {
    throw new Error(data?.error?.message ?? "Falha ao solicitar código");
  }
}

export async function confirmVerificationCode(
  email: string,
  code: string,
): Promise<void> {
  const { status, data } = await publicCall(
    "/api/proxy/auth/verify-code",
    "POST",
    { email, code },
  );
  if (status !== 200 || !data.success) {
    throw new Error(data?.error?.message ?? "Código inválido");
  }
}

export async function completeSignup(input: {
  email: string;
  password: string;
  businessName: string;
  responsibleName: string;
  phone?: string;
  segment?: string;
  planId?: string;
  cpfCnpj?: string;
}): Promise<SignupResult> {
  const { status, data } = await publicCall<SignupResult>(
    "/api/proxy/auth/signup",
    "POST",
    input,
  );
  if (status !== 201 || !data.success || !data.data) {
    throw new Error(data?.error?.message ?? "Falha ao criar empresa");
  }
  return data.data;
}
