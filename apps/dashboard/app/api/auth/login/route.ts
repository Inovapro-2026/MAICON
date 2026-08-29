import { NextRequest, NextResponse } from "next/server";
import { setSessionOnResponse } from "@/lib/auth";

export async function POST(req: NextRequest) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: { code: "BAD_REQUEST", message: "JSON inválido" },
      },
      { status: 400 },
    );
  }

  const apiBase = process.env.API_BASE_URL || "http://localhost:4005";
  const res = await fetch(`${apiBase}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: body.email, password: body.password }),
    cache: "no-store",
  });

  const data = await res.json().catch(() => null);

  if (!res.ok || !data?.success) {
    const message = data?.error?.message ?? "Falha no login";
    return NextResponse.json(
      { success: false, error: { code: "INVALID_CREDENTIALS", message } },
      { status: 401 },
    );
  }

  const payload = data.data as {
    token: string;
    user: unknown;
    must_change_password: boolean;
    active_business?: {
      id: string;
      name: string;
      slug: string;
      role: string;
      status: string;
      suspension_reason?: string | null;
    } | null;
  };

  const response = NextResponse.json({
    success: true,
    user: payload.user,
    must_change_password: payload.must_change_password,
    active_business: payload.active_business ?? null,
  });
  return setSessionOnResponse(response, payload.token);
}
