"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { adminApi, AuditLogEntry } from "@/lib/admin";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  auditActionLabel,
  auditTone,
  describeAuditMeta,
  rawMetaText,
  AUDIT_ACTION_LABELS,
  AuditMetaDescription,
} from "@/lib/audit-labels";

const PAGE_SIZE = 50;

interface AuditLogResolved extends AuditLogEntry {
  actor_name?: string | null;
  entity_name?: string | null;
}

/**
 * Traduz o texto digitado no filtro: se bate com a frase legível de uma ação,
 * usa o código técnico dela; senão, busca por trecho do código (backend usa
 * contains). Assim "plano" encontra admin.subscription.plan_changed.
 */
function resolveFilter(input: string): string {
  const t = input.trim().toLowerCase();
  if (!t) return "";
  const byLabel = Object.entries(AUDIT_ACTION_LABELS).find(([, label]) =>
    label.toLowerCase().includes(t),
  );
  if (byLabel) return byLabel[0];
  return t;
}

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<AuditLogResolved[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [action, setAction] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const seenRef = useRef<Set<string>>(new Set());
  const [planNameById, setPlanNameById] = useState<Record<string, string>>({});

  useEffect(() => {
    void adminApi<{ plans: { id: string; name: string }[] }>("/admin/plans")
      .then((r) =>
        setPlanNameById(
          Object.fromEntries((r.plans ?? []).map((p) => [p.id, p.name])),
        ),
      )
      .catch(() => {});
  }, []);

  const load = async (page: number, replace: boolean) => {
    const q = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    const filtered = resolveFilter(action);
    if (filtered) q.set("action", filtered);
    const r = await adminApi<{ logs: AuditLogResolved[]; total: number }>(
      `/admin/audit?${q.toString()}`,
    );
    const fresh = r.logs.filter((l) => !seenRef.current.has(l.id));
    for (const l of fresh) seenRef.current.add(l.id);
    setLogs((prev) => (replace ? fresh : [...prev, ...fresh]));
    setTotal(r.total);
  };

  const reload = async (replace = true) => {
    setError(null);
    try {
      await load(1, replace);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar auditoria");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    seenRef.current = new Set();
    setLoading(true);
    void reload(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action]);

  const loadMore = async () => {
    const nextPage = Math.floor(logs.length / PAGE_SIZE) + 1;
    setLoadingMore(true);
    setError(null);
    try {
      await load(nextPage, false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar mais");
    } finally {
      setLoadingMore(false);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    await reload(true);
    setRefreshing(false);
  };

  const hasMore = logs.length < total;

  // Agrupa sessões de suporte: associa cada session_ended à session_started
  // anterior da mesma empresa para exibir a duração.
  const supportMeta = useMemo(() => {
    const map = new Map<string, { startedAt: number; line: AuditMetaDescription }>();
    for (const l of logs) {
      if (l.action === "support.session_started" && l.business_id) {
        map.set(l.business_id, {
          startedAt: new Date(l.created_at).getTime(),
          line: describeAuditMeta(l.action, l.metadata, { planNameById }),
        });
      }
    }
    return map;
  }, [logs, planNameById]);

  const renderSupportDuration = (l: AuditLogResolved): string | null => {
    if (l.action !== "support.session_ended" || !l.business_id) return null;
    const start = supportMeta.get(l.business_id);
    if (!start) return null;
    const ms = new Date(l.created_at).getTime() - start.startedAt;
    if (ms < 0 || ms > 24 * 60 * 60 * 1000) return null;
    const s = Math.round(ms / 1000);
    if (s < 60) return `Duração: ${s}s`;
    return `Duração: ${Math.floor(s / 60)}min ${s % 60}s`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="heading-strong text-xl">Auditoria</h1>
          <p className="text-sm text-zinc-500">
            Trilha de auditoria da plataforma
          </p>
        </div>
        <div className="flex gap-2">
          <Input
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="Filtrar (ex.: pagamento, plano, suporte, user)"
            className="w-64"
          />
          <Button
            variant="outline"
            onClick={() => void refresh()}
            loading={refreshing}
          >
            Atualizar
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="text-sm text-zinc-500">Carregando...</div>
      ) : (
        <Card className="flex max-h-[70vh] flex-col p-0">
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-2.5">
            <span className="text-xs text-zinc-500">
              {total} evento{total === 1 ? "" : "s"} · exibindo {logs.length}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="divide-y divide-zinc-200">
              {logs.map((l) => {
                const label = auditActionLabel(l.action);
                const tone = auditTone(l.action);
                const meta = describeAuditMeta(l.action, l.metadata, {
                  planNameById,
                });
                const duration = renderSupportDuration(l);
                return (
                  <div
                    key={l.id}
                    className="px-4 py-3"
                    title={rawMetaText(l.metadata)}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <code
                        className={`rounded bg-white px-2 py-0.5 text-[11px] font-semibold ${tone}`}
                      >
                        {label}
                      </code>
                      <span className="text-[11px] text-zinc-500">
                        {new Date(l.created_at).toLocaleString("pt-BR")}
                      </span>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-zinc-500">
                      {l.actor_name ? (
                        <span>
                          por <span className="text-zinc-700">{l.actor_name}</span>
                        </span>
                      ) : l.actor ? (
                        <span title={`actor: ${l.actor}`}>
                          por <span className="text-zinc-700">{l.actor.slice(0, 12)}…</span>
                        </span>
                      ) : null}
                      {l.entity_name ? (
                        <span>
                          <span className="text-zinc-400">•</span>{" "}
                          <span className="text-zinc-700">{l.entity_name}</span>
                        </span>
                      ) : l.entity ? (
                        <span title={`${l.entity}:${l.entity_id}`}>
                          <span className="text-zinc-400">•</span>{" "}
                          {l.entity}:{String(l.entity_id ?? "").slice(0, 12)}
                        </span>
                      ) : null}
                      {l.business_id && !l.entity_name ? (
                        <span title={`business_id: ${l.business_id}`}>
                          <span className="text-zinc-400">•</span> empresa{" "}
                          {l.business_id.slice(0, 12)}…
                        </span>
                      ) : null}
                    </div>

                    {meta.lines.length > 0 ? (
                      <div className="mt-1 text-xs text-zinc-600">
                        {meta.lines.map((line, i) => (
                          <div key={i}>
                            <span className="text-emerald-600">→</span> {line}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {duration ? (
                      <div className="mt-1 text-xs text-zinc-500">{duration}</div>
                    ) : null}
                    {meta.warnings.length > 0 ? (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {meta.warnings.map((w, i) => (
                          <span
                            key={i}
                            className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-600"
                          >
                            ⚠ {w}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {logs.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-zinc-500">
                  Nenhum registro.
                </div>
              )}
            </div>
          </div>
          {hasMore && (
            <div className="border-t border-zinc-200 p-3">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => void loadMore()}
                loading={loadingMore}
              >
                Carregar mais
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
