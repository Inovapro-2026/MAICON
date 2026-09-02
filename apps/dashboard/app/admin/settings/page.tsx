"use client";

import { useEffect, useState } from "react";
import { adminApi, SettingRow, AdminApiKey } from "@/lib/admin";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KeyRound, Plus, Trash2, RotateCcw } from "lucide-react";

const PROVIDERS: Array<{ id: string; label: string }> = [
  { id: "elevenlabs", label: "ElevenLabs" },
  { id: "groq", label: "Groq" },
  { id: "openai", label: "OpenAI" },
];

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  // --- Chaves de API ---
  const [apiKeys, setApiKeys] = useState<AdminApiKey[]>([]);
  const [newKeyProvider, setNewKeyProvider] = useState("elevenlabs");
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [newKeyValue, setNewKeyValue] = useState("");
  const [savingKey, setSavingKey] = useState(false);

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

  const loadApiKeys = async () => {
    setError(null);
    try {
      const r = await adminApi<{ keys: AdminApiKey[] }>("/admin/api-keys");
      setApiKeys(r.keys);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar chaves de API");
    }
  };

  useEffect(() => {
    void load();
    void loadApiKeys();
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

  const addApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingKey(true);
    setError(null);
    try {
      await adminApi("/admin/api-keys", "POST", {
        provider: newKeyProvider,
        key: newKeyValue,
        label: newKeyLabel,
      });
      setNewKeyLabel("");
      setNewKeyValue("");
      await loadApiKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar chave");
    } finally {
      setSavingKey(false);
    }
  };

  const removeApiKey = async (id: string) => {
    if (!window.confirm("Remover esta chave de API?")) return;
    setError(null);
    try {
      await adminApi(`/admin/api-keys/${id}`, "DELETE");
      await loadApiKeys();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao remover chave");
    }
  };

  const reactivateApiKey = async (id: string) => {
    setError(null);
    try {
      await adminApi(`/admin/api-keys/${id}/status`, "PATCH", { status: "ACTIVE" });
      await loadApiKeys();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao reativar chave");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="heading-strong text-xl">
          Configurações
        </h1>
        <p className="text-sm text-zinc-500">
          Configurações globais da plataforma
        </p>
      </div>
      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}

      {/* Chaves de API */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-emerald-600" />
          <h2 className="heading-strong text-lg">Chaves de API</h2>
        </div>
        <p className="mb-4 text-sm text-zinc-500">
          Chaves usadas pelo Agente de Voz (ElevenLabs e Groq). Armazenadas
          criptografadas. Quando a chave ativa atingir o limite, o sistema
          tenta automaticamente a próxima chave cadastrada.
        </p>

        <Card className="mb-4 p-4">
          <form
            onSubmit={addApiKey}
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <div className="sm:w-44">
              <label className="label">Provedor</label>
              <select
                value={newKeyProvider}
                onChange={(e) => setNewKeyProvider(e.target.value)}
                className="input"
              >
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <Input
                label="Rótulo (opcional)"
                value={newKeyLabel}
                onChange={(e) => setNewKeyLabel(e.target.value)}
                placeholder="ex.: Chave principal"
              />
            </div>
            <div className="flex-[2]">
              <Input
                label="Valor da chave"
                value={newKeyValue}
                onChange={(e) => setNewKeyValue(e.target.value)}
                placeholder="sk_... (apenas os últimos 4 caracteres serão exibidos depois)"
                type="password"
                autoComplete="off"
                required
              />
            </div>
            <Button type="submit" loading={savingKey}>
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
          </form>
        </Card>

        {apiKeys.length === 0 ? (
          <Card className="p-4 text-sm text-zinc-500">
            Nenhuma chave de API cadastrada. As chaves do{" "}
            <code className="text-xs">.env</code> são usadas como fallback
            inicial.
          </Card>
        ) : (
          <div className="space-y-2">
            {PROVIDERS.map((provider) => {
              const keys = apiKeys.filter((k) => k.provider === provider.id);
              if (keys.length === 0) return null;
              return (
                <Card key={provider.id} className="p-4">
                  <div className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-400">
                    {provider.label}
                  </div>
                  <div className="space-y-2">
                    {keys.map((k) => (
                      <div
                        key={k.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#E6E8F0] bg-white px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <code className="text-sm font-semibold text-zinc-800">
                              {k.key_suffix}
                            </code>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                                k.status === "ACTIVE"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-red-100 text-red-600"
                              }`}
                            >
                              {k.status === "ACTIVE" ? "Ativa" : "Esgotada"}
                            </span>
                          </div>
                          <div className="text-[11px] text-zinc-500">
                            {k.label ? `${k.label} · ` : ""}criada em{" "}
                            {new Date(k.created_at).toLocaleDateString("pt-BR")}
                          </div>
                          {k.last_error ? (
                            <div className="mt-1 max-w-md truncate text-[11px] text-red-500">
                              {k.last_error}
                            </div>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 gap-2">
                          {k.status !== "ACTIVE" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void reactivateApiKey(k.id)}
                            >
                              <RotateCcw className="h-3.5 w-3.5" /> Reativar
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void removeApiKey(k.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Remover
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Configurações chave/valor genéricas */}
      <div>
        <div className="mb-3">
          <h2 className="heading-strong text-lg">Configurações chave/valor</h2>
          <p className="text-sm text-zinc-500">
            Pares chave/valor genéricos da plataforma
          </p>
        </div>

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
    </div>
  );
}
