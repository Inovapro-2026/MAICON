import { SignJWT, jwtVerify } from 'jose';
import { config } from '@prospector/config';

const secret = new TextEncoder().encode(config.app.sessionSecret);
const EXPIRES_IN = '7d';

export interface TokenPayload {
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

export async function signToken(payload: TokenPayload): Promise<string> {
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
    .setExpirationTime(EXPIRES_IN)
    .sign(secret);
}

export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return {
      sub: String(payload.sub ?? ''),
      email: String(payload.email ?? ''),
      role: (payload.role as TokenPayload['role']) ?? 'ADMIN',
      must_change_password: Boolean(payload.must_change_password),
      platform_role: (payload.platform_role as TokenPayload['platform_role']) ?? undefined,
      businessId: payload.businessId ? String(payload.businessId) : undefined,
      businessRole: payload.businessRole
        ? (String(payload.businessRole) as TokenPayload['businessRole'])
        : undefined,
      impersonating: payload.impersonating ? Boolean(payload.impersonating) : undefined,
      impersonator: payload.impersonator ? String(payload.impersonator) : undefined,
      impersonationReason: payload.impersonationReason ? String(payload.impersonationReason) : undefined,
    };
  } catch {
    return null;
  }
}