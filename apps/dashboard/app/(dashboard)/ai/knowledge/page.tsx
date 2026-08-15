'use client';

import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
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
  active: boolean;
  created_at: string;
}

const CATEGORIES = [
  { value: 'PRODUCTS', label: 'Produtos' },
  { value: 'SERVICES', label: 'Serviços' },
  { value: 'PRICES', label: 'Preços' },
  { value: 'HOURS', label: 'Horários' },
  { value: 'POLICIES', label: 'Políticas' },
  { value: 'FAQ', label: 'FAQ' },
  { value: 'ADDRESS', label: 'Endereço' },
  { value: 'PAYMENT', label: 'Formas de pagamento' },
  { value: 'INTERNAL_RULES', label: 'Regras internas' },
];

export default function AIKnowledgePage() {
  const { success, error: toastError } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useApi<{ items: KnowledgeItem[] }>(['ai-knowledge'], 'ai/knowledge');
  const items = data?.items ?? [];

  const [editing, setEditing] = useState<KnowledgeItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('FAQ');

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['ai-knowledge'] });

  const mutation = useApiMutationMethod({
    onSuccess: () => {
      success('Salvo');
      setCreating(false);
      setEditing(null);
      setTitle('');
      setContent('');
      setCategory('FAQ');
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
    if (editing) {
      await mutation.mutateAsync({
        _method: 'PATCH',
        _path: `ai/knowledge/${editing.id}`,
        title,
        content,
        category,
      });
    } else {
      await mutation.mutateAsync({ _method: 'POST', _path: 'ai/knowledge', title, content, category });
    }
  };

  const startEdit = (item: KnowledgeItem) => {
    setEditing(item);
    setCreating(true);
    setTitle(item.title);
    setContent(item.content);
    setCategory(item.category);
  };

  const categoryLabel = (v: string) => CATEGORIES.find((c) => c.value === v)?.label ?? v;

  return (
    <DashboardShell title="Base de conhecimento">
      <div className="mb-6">
        <h1 className="heading-strong text-xl">Base de conhecimento</h1>
        <p className="text-sm text-zinc-500">Informações que o agente de IA usa para responder seus clientes</p>
      </div>

      <Card className="mb-6">
        <CardHeader
          title={creating ? (editing ? 'Editar item' : 'Novo item') : 'Adicionar informação'}
          action={
            creating ? (
              <Button size="sm" variant="ghost" onClick={() => { setCreating(false); setEditing(null); setTitle(''); setContent(''); }}>
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
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">Categoria</label>
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
              <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={4} placeholder="Ex.: O corte de cabelo custa R$ 50 e inclui lavagem." className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-emerald-500/60" />
            </div>
            <Button onClick={() => void save()} loading={mutation.isPending}>
              <Plus className="mr-2 h-4 w-4" />
              {editing ? 'Salvar alterações' : 'Adicionar'}
            </Button>
          </div>
        ) : (
          <div className="p-5">
            <Button onClick={() => { setCreating(true); setEditing(null); setTitle(''); setContent(''); setCategory('FAQ'); }}>
              <Plus className="mr-2 h-4 w-4" />
              Nova informação
            </Button>
          </div>
        )}
      </Card>

      {isLoading ? (
        <div className="text-sm text-zinc-500">Carregando...</div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id} className="p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-zinc-900">{item.title}</span>
                    <span className="rounded-full border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-500">{categoryLabel(item.category)}</span>
                    {!item.active && <span className="rounded-full border border-zinc-300 px-2 py-0.5 text-[11px] text-zinc-500">inativo</span>}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-500">{item.content}</p>
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
          {items.length === 0 && !isLoading && (
            <div className="rounded-xl border border-dashed border-zinc-200 p-6 text-center text-sm text-zinc-500">
              Nenhuma informação cadastrada ainda. Adicione produtos, preços, horários e políticas para ensinar a IA.
            </div>
          )}
        </div>
      )}
    </DashboardShell>
  );
}