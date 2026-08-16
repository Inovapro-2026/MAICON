import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const SECRET = () => new TextEncoder().encode(process.env.SESSION_SECRET || 'dev-secret');
const SESSION_COOKIE = 'acp_token';

const PROTECTED_PREFIXES = ['/dashboard', '/lead-import', '/prospect', '/campaigns', '/inbox', '/clientes', '/reports', '/settings', '/change-password', '/payment', '/admin', '/ai'];
const PUBLIC_PATHS = ['/login', '/signup'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const isAsset = pathname.startsWith('/_next') || pathname.startsWith('/favicon') || pathname.includes('.');

  // Raiz -> login (ou dashboard se já autenticado)
  if (pathname === '/') {
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    let authed = false;
    if (token) {
      try {
        await jwtVerify(token, SECRET());
        authed = true;
      } catch {
        authed = false;
      }
    }
    const url = req.nextUrl.clone();
    url.pathname = authed ? '/dashboard' : '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }

  if (isAsset || (!isProtected && !isPublic)) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  let session: { must_change_password?: boolean; platform_role?: string } | null = null;

  if (token) {
    try {
      const { payload } = await jwtVerify(token, SECRET());
      session = {
        must_change_password: Boolean(payload.must_change_password),
        platform_role: (payload.platform_role as string) || undefined,
      };
    } catch {
      session = null;
    }
  }

  const isChangePassword = pathname === '/change-password';

  // Sem sessão válida -> login
  if (!session) {
    if (isPublic) return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // Sessão válida em página pública -> dashboard
  if (isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // Precisa trocar a senha -> força a tela de troca
  if (session.must_change_password && !isChangePassword) {
    const url = req.nextUrl.clone();
    url.pathname = '/change-password';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // Senha já trocada, acessando /change-password -> dashboard
  if (!session.must_change_password && isChangePassword) {
    const url = req.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // Rota /admin: exige papel de plataforma (defesa em profundidade; o layout
  // server-side também valida). Sem papel -> /dashboard, sem montar conteúdo.
  const isAdminPath = pathname === '/admin' || pathname.startsWith('/admin/');
  if (isAdminPath) {
    const role = session.platform_role;
    if (role !== 'PLATFORM_ADMIN' && role !== 'PLATFORM_STAFF') {
      const url = req.nextUrl.clone();
      url.pathname = '/dashboard';
      url.search = '';
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
};
