"use client";

import { useEffect, useState } from "react";
import { adminApi, SettingRow } from "@/lib/admin";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await adminApi<{ settings: SettingRow[] }>("/admin/settings");
      setSettings(r.settings);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await adminApi("/admin/settings", "PATCH", { key, value });
      setKey("");
      setValue("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async (k: string) => {
    setSaving(true);
    setError(null);
    try {
      await adminApi("/admin/settings", "PATCH", { key: k, value: editValue });
      setEditingKey(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (k: string) => {
    if (!window.confirm(`Remover a chave "${k}"?`)) return;
    setError(null);
    try {
      await adminApi(`/admin/settings/${encodeURIComponent(k)}`, "DELETE");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao remover");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="heading-strong text-xl">
          Configurações
        </h1>
        <p className="text-sm text-zinc-500">
          Configurações globais da plataforma (pares chave/valor)
        </p>
      </div>
      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}

      <Card className="p-4">
        <form
          onSubmit={save}
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <div className="flex-1">
            <Input
              label="Chave"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="ex.: default_whatsapp_daily_limit"
              required
            />
          </div>
          <div className="flex-1">
            <Input
              label="Valor"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="ex.: 30"
              required
            />
          </div>
          <Button type="submit" loading={saving}>
            Salvar
          </Button>
        </form>
      </Card>

      {loading ? (
        <div className="text-sm text-zinc-500">Carregando...</div>
      ) : (
        <div className="space-y-2">
          {settings.map((s) => (
            <Card key={s.key} className="p-3">
              {editingKey === s.key ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <div className="label">{s.key}</div>
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => void saveEdit(s.key)}
                      loading={saving}
                    >
                      Salvar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingKey(null)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <code className="text-xs text-emerald-600">{s.key}</code>
                    <div className="truncate text-sm text-zinc-700">
                      {s.value}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingKey(s.key);
                        setEditValue(s.value);
                      }}
                    >
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void remove(s.key)}
                    >
                      Remover
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          ))}
          {settings.length === 0 && (
            <div className="text-sm text-zinc-500">Nenhuma configuração.</div>
          )}
        </div>
      )}
    </div>
  );
}
