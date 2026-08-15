'use client';

import { useEffect, useState } from 'react';

export interface SessionUser {
  sub: string;
  email: string;
  role: 'ADMIN';
  businessId?: string;
  businessRole?: 'OWNER' | 'BUSINESS_ADMIN' | 'MANAGER' | 'AGENT';
  platform_role?: 'NONE' | 'PLATFORM_ADMIN' | 'PLATFORM_STAFF';
}

/**
 * Lê a sessão atual (cookie httpOnly) via /api/auth/me.
 * Usado para decisões de UI como exibir ações restritas a OWNER/BUSINESS_ADMIN
 * (a autorização real é sempre validada no backend).
 */
export function useSession(): { user: SessionUser | null; loading: boolean } {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (active && json?.success) setUser(json.user as SessionUser);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { user, loading };
}

/** True quando o usuário tem papel de empresa OWNER ou BUSINESS_ADMIN. */
export function isBusinessOwnerOrAdmin(role?: SessionUser['businessRole']): boolean {
  return role === 'OWNER' || role === 'BUSINESS_ADMIN';
}
