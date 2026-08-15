import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';

export const SESSION_COOKIE = 'acp_token';

const secret = () => new TextEncoder().encode(process.env.SESSION_SECRET || 'dev-secret');

export interface SessionPayload {
  sub: string;
  email: string;
  role: 'ADMIN';
  must_change_password: boolean;
  platform_role?: 'NONE' | 'PLATFORM_ADMIN' | 'PLATFORM_STAFF';
  businessId?: string;
  businessRole?: 'OWNER' | 'BUSINESS_ADMIN' | 'MANAGER' | 'AGENT';
  impersonating?: boolean;
  impersonator?: string;
  impersonationReason?: string;
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({
    email: payload.email,
    role: payload.role,
    must_change_password: payload.must_change_password,
    platform_role: payload.platform_role,
    businessId: payload.businessId,
    businessRole: payload.businessRole,
    impersonating: payload.impersonating,
    impersonator: payload.impersonator,
    impersonationReason: payload.impersonationReason,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      sub: String(payload.sub ?? ''),
      email: String(payload.email ?? ''),
      role: (payload.role as SessionPayload['role']) ?? 'ADMIN',
      must_change_password: Boolean(payload.must_change_password),
      platform_role: (payload.platform_role as SessionPayload['platform_role']) ?? undefined,
      businessId: payload.businessId ? String(payload.businessId) : undefined,
      businessRole: payload.businessRole ? (String(payload.businessRole) as SessionPayload['businessRole']) : undefined,
      impersonating: payload.impersonating ? Boolean(payload.impersonating) : undefined,
      impersonator: payload.impersonator ? String(payload.impersonator) : undefined,
      impersonationReason: payload.impersonationReason ? String(payload.impersonationReason) : undefined,
    };
  } catch {
    return null;
  }
}

/** Retorna a sessão atual lendo o cookie httpOnly. */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

/** Opções do cookie de sessão (para anexar via response.cookies.set). */
export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 60 * 60 * 24 * 7,
  path: '/',
};

/** Define o cookie de sessão na resposta (Route Handler). */
export function setSessionOnResponse(
  response: NextResponse,
  token: string
): NextResponse {
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return response;
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
