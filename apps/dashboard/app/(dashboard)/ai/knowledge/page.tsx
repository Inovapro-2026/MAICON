'use client';

import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Search as SearchIcon } from 'lucide-react';
import { DashboardShell } from '@/components/layout/shell';
import { Card, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useApi, useApiMutationMethod, request } from '@/hooks/use-api';
import { useQueryClient } from '@tanstack/react-query';

interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  category: string;
  keywords: string | null;
  active: boolean;
  created_at: string;
}

const CATEGORIES = [
  { value: 'PRODUCTS', label: 'Produtos' },
  { value: 'SERVICES', label: 'Serviços' },
  { value: 'PLANS', label: 'Planos' },
  { value: 'PRICES', label: 'Preços' },
  { value: 'PROMOTIONS', label: 'Promoções' },
  { value: 'HOURS', label: 'Horários' },
  { value: 'DAYS', label: 'Dias de atendimento' },
  { value: 'PAYMENT', label: 'Formas de pagamento' },
  { value: 'ADDRESS', label: 'Endereço' },
  { value: 'FAQ', label: 'FAQ' },
  { value: 'POLICIES', label: 'Políticas' },
  { value: 'BENEFITS', label: 'Benefícios' },
  { value: 'COMMERCIAL_RULES', label: 'Regras comerciais' },
  { value: 'LINKS', label: 'Links' },
  { value: 'INTERNAL_RULES', label: 'Regras internas' },
];

const FILTERS = [
  { value: 'ALL', label: 'Todos' },
  ...CATEGORIES.map((c) => ({ value: c.value, label: c.label })),
];

export default function AIKnowledgePage() {
  const { success, error: toastError } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useApi<{ items: KnowledgeItem[] }>(['ai-knowledge'], 'ai/knowledge');
  const items = data?.items ?? [];

  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<KnowledgeItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('FAQ');
  const [keywords, setKeywords] = useState('');

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['ai-knowledge'] });

  const mutation = useApiMutationMethod({
    onSuccess: () => {
      success('Salvo');
      setCreating(false);
      setEditing(null);
      setTitle('');
      setContent('');
      setCategory('FAQ');
      setKeywords('');
      invalidate();
    },
    onError: (err) => toastError(err.message),
  });

  const toggleActive = async (item: KnowledgeItem) => {
    await mutation.mutateAsync({ _method: 'PATCH', _path: `ai/knowledge/${item.id}`, active: !item.active });
  };

  const remove = async (item: KnowledgeItem) => {
    if (!window.confirm(`Excluir "${item.title}"?`)) return;
    await mutation.mutateAsync({ _method: 'DELETE', _path: `ai/knowledge/${item.id}` });
  };

  const save = async () => {
    const payload = { title, content, category, keywords };
    if (editing) {
      await mutation.mutateAsync({ _method: 'PATCH', _path: `ai/knowledge/${editing.id}`, ...payload });
    } else {
      await mutation.mutateAsync({ _method: 'POST', _path: 'ai/knowledge', ...payload });
    }
  };

  const resetForm = () => {
    setEditing(null);
    setTitle('');
    setContent('');
    setCategory('FAQ');
    setKeywords('');
  };

  const startEdit = (item: KnowledgeItem) => {
    setEditing(item);
    setCreating(true);
    setTitle(item.title);
    setContent(item.content);
    setCategory(item.category);
    setKeywords(item.keywords ?? '');
  };

  const categoryLabel = (v: string) => CATEGORIES.find((c) => c.value === v)?.label ?? v;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (filter !== 'ALL' && it.category !== filter) return false;
      if (!q) return true;
      const hay = `${it.title} ${it.content} ${it.keywords ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, filter, search]);

  const total = items.length;
  const active = items.filter((i) => i.active).length;
  const inactive = total - active;

  return (
    <DashboardShell title="Base de conhecimento">
      <div className="mb-6">
        <h1 className="heading-strong text-xl">Base de conhecimento</h1>
        <p className="text-sm text-zinc-500">O cérebro comercial configurável da sua empresa — produtos, serviços, preços, planos, horários, políticas e links que a IA usa para vender e atender.</p>
      </div>

      {/* Contador + busca */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <span className="rounded-full border border-zinc-200 bg-white px-3 py-1">Conhecimentos: <strong className="text-zinc-800">{total}</strong></span>
          <span className="rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3 py-1 text-emerald-600">Ativos: <strong>{active}</strong></span>
          <span className="rounded-full border border-zinc-200 bg-white px-3 py-1">Desativados: <strong className="text-zinc-800">{inactive}</strong></span>
        </div>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar conhecimento..."
            className="w-full rounded-xl border border-zinc-200 bg-white py-2 pl-9 pr-4 text-sm text-zinc-900 placeholder-zinc-400 outline-none focus:border-emerald-500/60 sm:w-64"
          />
        </div>
      </div>

      {/* Filtros por categoria */}
      <div className="-mx-4 mb-5 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
        <div className="flex w-max gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={`h-8 shrink-0 rounded-full px-3 text-xs font-medium transition-colors ${
                filter === f.value ? 'bg-emerald-500/15 text-emerald-600 ring-1 ring-emerald-500/40' : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader
          title={creating ? (editing ? 'Editar conhecimento' : 'Nova informação') : 'Adicionar informação'}
          subtitle="Modo rápido: título + conteúdo + categoria + palavras-chave (opcional)"
          action={
            creating ? (
              <Button size="sm" variant="ghost" onClick={() => { setCreating(false); resetForm(); }}>
                Cancelar
              </Button>
            ) : undefined
          }
        />
        {creating ? (
          <div className="space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Título" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Preço do corte de cabelo" />
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">Tipo de conhecimento</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-emerald-500/60">
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-700">Conteúdo</label>
              <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={4} placeholder="Ex.: O corte de cabelo custa R$ 25,00 e funciona de terça a sábado, das 09h às 19h." className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-emerald-500/60" />
            </div>
            <Input label="Palavras-chave (opcional)" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="preço, valor, quanto custa, corte" hint="Separadas por vírgula — ajudam a IA a encontrar este conhecimento." />
            <Button onClick={() => void save()} loading={mutation.isPending}>
              <Plus className="mr-2 h-4 w-4" />
              {editing ? 'Salvar alterações' : 'Adicionar'}
            </Button>
          </div>
        ) : (
          <div className="p-5">
            <Button onClick={() => { setCreating(true); resetForm(); }}>
              <Plus className="mr-2 h-4 w-4" />
              Nova informação
            </Button>
          </div>
        )}
      </Card>

      {isLoading ? (
        <div className="text-sm text-zinc-500">Carregando...</div>
      ) : filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map((item) => (
            <Card key={item.id} className="p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-zinc-900">{item.title}</span>
                    <span className="rounded-full border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-[11px] uppercase tracking-wide text-zinc-500">{categoryLabel(item.category)}</span>
                    {item.active ? (
                      <span className="flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-2 py-0.5 text-[11px] text-emerald-600">● Ativo</span>
                    ) : (
                      <span className="rounded-full border border-zinc-300 px-2 py-0.5 text-[11px] text-zinc-500">inativo</span>
                    )}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-500">{item.content}</p>
                  {item.keywords ? <p className="mt-1 text-[11px] text-zinc-400">Palavras-chave: {item.keywords}</p> : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => void toggleActive(item)}>
                    {item.active ? 'Desativar' : 'Ativar'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => startEdit(item)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => void remove(item)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-zinc-200 p-6 text-center text-sm text-zinc-500">
          {search || filter !== 'ALL'
            ? 'Nenhum conhecimento encontrado para este filtro/busca.'
            : 'Nenhuma informação cadastrada ainda. Adicione produtos, preços, horários, políticas e links para ensinar a IA.'}
        </div>
      )}
    </DashboardShell>
  );
}
