import { getSession } from './auth';

const API_BASE = process.env.API_BASE_URL || 'http://localhost:4005';

/** Proxy server-side para a API, injetando o token da sessão. */
export async function apiFetch<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown; isForm?: boolean } = {}
): Promise<{ status: number; data: T }> {
  const session = await getSession();
  if (!session) {
    throw new Error('Não autenticado');
  }

  const headers: Record<string, string> = {};
  if (options.isForm) {
    // body já é FormData
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  // Inclui o token da API caso o cookie seja o JWT da API
  const { cookies } = await import('next/headers');
  const store = await cookies();
  const token = store.get('acp_token')?.value;

  const res = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.isForm ? (options.body as FormData) : options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
  });

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  return { status: res.status, data: data as T };
}
