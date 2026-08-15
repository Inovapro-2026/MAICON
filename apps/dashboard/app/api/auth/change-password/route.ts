import { NextRequest, NextResponse } from 'next/server';
import { getSession, setSessionOnResponse } from '@/lib/auth';

export async function POST(req: NextRequest) {
  let body: { current_password?: string; new_password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'JSON inválido' } }, { status: 400 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Não autenticado' } }, { status: 401 });
  }

  const apiBase = process.env.API_BASE_URL || 'http://localhost:4005';
  const res = await fetch(`${apiBase}/auth/change-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${req.cookies.get('acp_token')?.value ?? ''}`,
    },
    body: JSON.stringify({ current_password: body.current_password, new_password: body.new_password }),
    cache: 'no-store',
  });

  const data = await res.json().catch(() => null);

  if (!res.ok || !data?.success) {
    const message = data?.error?.message ?? 'Falha ao alterar senha';
    return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message } }, { status: 400 });
  }

  const newToken = (data.data as { token?: string } | undefined)?.token;
  const response = NextResponse.json({ success: true });
  if (newToken) {
    return setSessionOnResponse(response, newToken);
  }
  return response;
}
