'use client';

import { useMutation, useQuery, UseMutationOptions, UseQueryOptions } from '@tanstack/react-query';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { message?: string };
}

async function request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api/proxy/${path}`, {
    method: options.method ?? 'GET',
    headers: options.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;

  if (!res.ok || !json?.success) {
    throw new Error(json?.error?.message ?? `Falha na requisição (${res.status})`);
  }
  return json.data as T;
}

/** GET tipado com React Query. */
export function useApi<T>(key: string[], path: string, options?: Omit<UseQueryOptions<T, Error>, 'queryKey' | 'queryFn'>) {
  return useQuery<T, Error>({
    queryKey: key,
    queryFn: () => request<T>(path),
    ...options,
  });
}

/** Mutação tipada com React Query. */
export function useApiMutation<T = unknown, V = unknown>(
  path: string,
  options?: Omit<UseMutationOptions<T, Error, V>, 'mutationFn'>
) {
  return useMutation<T, Error, V>({
    mutationFn: (variables) => request<T>(path, { method: 'POST', body: variables as object }),
    ...options,
  });
}

/** Mutação com método e caminho dinâmicos. */
export function useApiMutationMethod<T = unknown, V = unknown>(
  options?: Omit<UseMutationOptions<T, Error, V>, 'mutationFn'>
) {
  return useMutation<T, Error, V>({
    mutationFn: async (variables) => {
      const v = variables as { _method?: string; _path?: string } & V;
      const method = v._method ?? 'POST';
      const path = (v as { _path?: string })._path;
      if (!path) throw new Error('Caminho não informado');
      const { _method, _path, ...body } = v as Record<string, unknown>;
      return request<T>(path, { method, body });
    },
    ...options,
  });
}

export { request };
