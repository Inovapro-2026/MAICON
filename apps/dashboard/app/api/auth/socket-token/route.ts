import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getSession, SESSION_COOKIE } from '@/lib/auth';

/**
 * Fornece o token da sessão para a conexão WebSocket (Socket.IO).
 * O cookie é httpOnly; esta rota devolve o mesmo JWT para o cliente
 * autenticar o handshake do socket na API (que valida o mesmo segredo).
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Não autenticado' } }, { status: 401 });
  }

  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value ?? '';

  if (!token) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Token ausente' } }, { status: 401 });
  }

  return NextResponse.json({ success: true, token }, { headers: { 'Cache-Control': 'no-store' } });
}