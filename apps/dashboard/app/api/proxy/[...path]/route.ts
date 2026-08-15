import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

const API_BASE = process.env.API_BASE_URL || 'http://localhost:4005';

/** Rotas públicas (onboarding): não exigem sessão — a API valida a origem. */
const PUBLIC_PATHS = ['auth/plans', 'auth/send-code', 'auth/verify-code', 'auth/signup'];

/**
 * Proxy genérico para a API. Toda chamada do dashboard a dados
 * passa por aqui com o token da sessão (cookie httpOnly).
 */
async function proxy(req: NextRequest, context: { params: { path: string[] } }) {
  const path = context.params.path.join('/');
  const isPublic = PUBLIC_PATHS.some((p) => path === p);

  if (!isPublic) {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Não autenticado' } }, { status: 401 });
    }
  }

  const url = `${API_BASE}/${path}${req.nextUrl.search}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${req.cookies.get('acp_token')?.value ?? ''}`,
  };
  const contentType = req.headers.get('content-type');
  if (contentType) headers['Content-Type'] = contentType;

  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await req.arrayBuffer();

  const res = await fetch(url, {
    method: req.method,
    headers,
    body,
    cache: 'no-store',
    signal: AbortSignal.timeout(60000),
  });

  const responseData = await res.arrayBuffer();
  const contentTypeOut = res.headers.get('content-type') ?? 'application/json';

  return new NextResponse(responseData, {
    status: res.status,
    headers: { 'Content-Type': contentTypeOut },
  });
}

export async function GET(req: NextRequest, context: { params: { path: string[] } }) {
  return proxy(req, context);
}
export async function POST(req: NextRequest, context: { params: { path: string[] } }) {
  return proxy(req, context);
}
export async function PATCH(req: NextRequest, context: { params: { path: string[] } }) {
  return proxy(req, context);
}
export async function PUT(req: NextRequest, context: { params: { path: string[] } }) {
  return proxy(req, context);
}
export async function DELETE(req: NextRequest, context: { params: { path: string[] } }) {
  return proxy(req, context);
}
