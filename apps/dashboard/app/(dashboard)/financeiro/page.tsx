"use client";

import { useState, useEffect, useCallback } from "react";
import { DashboardShell } from "@/components/layout/shell";
import { Wallet, TrendingUp, TrendingDown, Plus, Trash2, Edit3, X, AlertCircle, ArrowUpRight, ArrowDownRight, PiggyBank, CalendarDays } from "lucide-react";

const API_BASE = "/api/proxy";

interface Transaction {
  id: string;
  type: "INCOME" | "EXPENSE";
  description: string;
  amount: number;
  date: string;
  category: string | null;
  category_id: string | null;
  status: string;
  recurrence: string;
  notes: string | null;
}

interface FinancialSummary {
  current_month: { income: number; expenses: number; balance: number };
  last_month: { income: number; expenses: number; balance: number };
  planned: { income: number; expenses: number };
  categories: Array<{ id: string; name: string; type: string; color: string | null }>;
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function TransactionModal({ transaction, onClose, onSave, onDelete }: {
  transaction?: Transaction | null;
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}) {
  const [type, setType] = useState(transaction?.type ?? "EXPENSE");
  const [description, setDescription] = useState(transaction?.description ?? "");
  const [amount, setAmount] = useState(transaction ? String(transaction.amount) : "");
  const [date, setDate] = useState(transaction ? new Date(transaction.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState(transaction?.category ?? "");
  const [recurrence, setRecurrence] = useState(transaction?.recurrence ?? "NONE");
  const [notes, setNotes] = useState(transaction?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || !amount) { setError("Descrição e valor são obrigatórios"); return; }
    const value = parseFloat(amount.replace(",", "."));
    if (isNaN(value) || value <= 0) { setError("Valor inválido"); return; }
    setSaving(true);
    setError("");
    try {
      await onSave({ type, description: description.trim(), amount: value, date: new Date(date).toISOString(), category: category || null, recurrence, notes: notes.trim() || null });
      onClose();
    } catch (e: any) {
      setError(e.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-[#E6E8F0]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[#0F172A]">{transaction ? "Editar transação" : "Nova transação"}</h2>
          <button onClick={onClose} className="rounded-xl p-2 text-[#94A3B8] hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        {error && <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-600"><AlertCircle className="h-4 w-4" />{error}</div>}
        <form onSubmit={handleSave} className="space-y-4">
          <div className="flex gap-2">
            <button type="button" onClick={() => setType("EXPENSE")} className={`flex-1 rounded-xl border-2 px-4 py-3 text-center text-sm font-bold transition-colors ${type === "EXPENSE" ? "border-red-400 bg-red-50 text-red-600" : "border-[#E6E8F0] text-[#64748B] hover:border-slate-300"}`}><TrendingDown className="mr-1 inline h-4 w-4" />Despesa</button>
            <button type="button" onClick={() => setType("INCOME")} className={`flex-1 rounded-xl border-2 px-4 py-3 text-center text-sm font-bold transition-colors ${type === "INCOME" ? "border-green-400 bg-green-50 text-green-600" : "border-[#E6E8F0] text-[#64748B] hover:border-slate-300"}`}><TrendingUp className="mr-1 inline h-4 w-4" />Receita</button>
          </div>
          <div>
            <label className="label">Descrição</label>
            <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: mercado, salário, internet" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Valor (R$)</label>
              <input className="input" type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" required />
            </div>
            <div>
              <label className="label">Data</label>
              <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Categoria</label>
              <input className="input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Ex.: alimentação" />
            </div>
            <div>
              <label className="label">Recorrência</label>
              <select className="input" value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
                <option value="NONE">Não recorrente</option>
                <option value="DAILY">Diário</option>
                <option value="WEEKLY">Semanal</option>
                <option value="MONTHLY">Mensal</option>
                <option value="YEARLY">Anual</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Observação (opcional)</label>
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observações" />
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? "Salvando..." : "Salvar"}</button>
            {transaction && onDelete && (
              <button type="button" onClick={() => { if (confirm("Remover esta transação?")) onDelete(transaction.id); }} className="btn-danger px-4"><Trash2 className="h-4 w-4" /></button>
            )}
            <button type="button" onClick={onClose} className="btn-outline px-4">Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function FinanceiroPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [filterType, setFilterType] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"overview" | "transactions">("overview");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [transRes, summRes] = await Promise.all([
        fetch(`${API_BASE}/financial/transactions`),
        fetch(`${API_BASE}/financial/summary`),
      ]);
      const transData = await transRes.json();
      const summData = await summRes.json();
      if (transData.success) setTransactions(transData.data.transactions ?? []);
      if (summData.success) setSummary(summData.data);
    } catch (e) {
      setError("Erro ao carregar dados financeiros");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async (data: any) => {
    const url = editingTransaction ? `${API_BASE}/financial/transactions/${editingTransaction.id}` : `${API_BASE}/financial/transactions`;
    const method = editingTransaction ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    const result = await res.json();
    if (!result.success) throw new Error(result.error?.message ?? "Erro ao salvar");
    await fetchData();
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`${API_BASE}/financial/transactions/${id}`, { method: "DELETE" });
    const result = await res.json();
    if (!result.success) throw new Error(result.error?.message ?? "Erro ao remover");
    await fetchData();
  };

  const filteredTransactions = transactions.filter((t) => {
    if (filterType && t.type !== filterType) return false;
    if (filterStatus && t.status !== filterStatus) return false;
    return true;
  });

  const currentBalance = summary ? summary.current_month.balance : 0;
  const currentIncome = summary ? summary.current_month.income : 0;
  const currentExpenses = summary ? summary.current_month.expenses : 0;
  const plannedIncome = summary ? summary.planned.income : 0;
  const plannedExpenses = summary ? summary.planned.expenses : 0;

  return (
    <DashboardShell title="Financeiro">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Wallet className="h-6 w-6 text-[#6366F1]" />
            <h1 className="text-2xl font-bold text-[#0F172A]">Financeiro</h1>
          </div>
          <button onClick={() => { setEditingTransaction(null); setShowModal(true); }} className="btn-primary flex items-center gap-2"><Plus className="h-4 w-4" /> Nova transação</button>
        </div>

        {error && <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600"><AlertCircle className="h-4 w-4" />{error}</div>}

        <div className="flex gap-1 rounded-xl border border-[#E6E8F0] p-1 w-fit">
          <button onClick={() => setActiveTab("overview")} className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${activeTab === "overview" ? "bg-white text-[#0F172A] shadow-sm" : "text-[#64748B] hover:text-[#0F172A]"}`}>Visão geral</button>
          <button onClick={() => setActiveTab("transactions")} className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${activeTab === "transactions" ? "bg-white text-[#0F172A] shadow-sm" : "text-[#64748B] hover:text-[#0F172A]"}`}>Transações</button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-[#94A3B8]">Carregando...</div>
        ) : activeTab === "overview" ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="card p-5">
                <div className="flex items-center gap-2 text-sm text-[#64748B]">
                  <TrendingUp className="h-4 w-4 text-green-500" />
                  Receitas
                </div>
                <p className="mt-2 text-2xl font-bold text-green-600">{formatCurrency(currentIncome)}</p>
                {summary && <p className="mt-1 text-xs text-[#94A3B8]">Mês passado: {formatCurrency(summary.last_month.income)}</p>}
              </div>
              <div className="card p-5">
                <div className="flex items-center gap-2 text-sm text-[#64748B]">
                  <TrendingDown className="h-4 w-4 text-red-500" />
                  Despesas
                </div>
                <p className="mt-2 text-2xl font-bold text-red-600">{formatCurrency(currentExpenses)}</p>
                {summary && <p className="mt-1 text-xs text-[#94A3B8]">Mês passado: {formatCurrency(summary.last_month.expenses)}</p>}
              </div>
              <div className="card p-5">
                <div className="flex items-center gap-2 text-sm text-[#64748B]">
                  <PiggyBank className="h-4 w-4 text-[#6366F1]" />
                  Saldo
                </div>
                <p className={`mt-2 text-2xl font-bold ${currentBalance >= 0 ? "text-[#6366F1]" : "text-red-600"}`}>{formatCurrency(currentBalance)}</p>
                {summary && <p className="mt-1 text-xs text-[#94A3B8]">Mês passado: {formatCurrency(summary.last_month.balance)}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="card p-5">
                <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-[#64748B]">Previsto para este mês</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm text-green-600"><ArrowUpRight className="h-4 w-4" />Receitas previstas</span>
                    <span className="font-bold text-green-600">{formatCurrency(plannedIncome)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm text-red-600"><ArrowDownRight className="h-4 w-4" />Despesas previstas</span>
                    <span className="font-bold text-red-600">{formatCurrency(plannedExpenses)}</span>
                  </div>
                  <div className="border-t border-[#E6E8F0] pt-2">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-sm font-bold text-[#0F172A]"><PiggyBank className="h-4 w-4 text-[#6366F1]" />Saldo projetado</span>
                      <span className={`font-bold ${currentIncome - currentExpenses + plannedIncome - plannedExpenses >= 0 ? "text-[#6366F1]" : "text-red-600"}`}>{formatCurrency(currentIncome - currentExpenses + plannedIncome - plannedExpenses)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="card p-5">
                <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-[#64748B]">Comparação com mês passado</h3>
                {summary && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[#475569]">Receitas</span>
                      <div className="text-right">
                        <span className="block text-sm font-bold text-[#0F172A]">{formatCurrency(summary.last_month.income)}</span>
                        <span className={`text-xs ${currentIncome >= summary.last_month.income ? "text-green-500" : "text-red-500"}`}>
                          {currentIncome >= summary.last_month.income ? "↑" : "↓"} {summary.last_month.income > 0 ? Math.abs(((currentIncome - summary.last_month.income) / summary.last_month.income) * 100).toFixed(1) : 0}%
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[#475569]">Despesas</span>
                      <div className="text-right">
                        <span className="block text-sm font-bold text-[#0F172A]">{formatCurrency(summary.last_month.expenses)}</span>
                        <span className={`text-xs ${currentExpenses <= summary.last_month.expenses ? "text-green-500" : "text-red-500"}`}>
                          {currentExpenses <= summary.last_month.expenses ? "↓" : "↑"} {summary.last_month.expenses > 0 ? Math.abs(((currentExpenses - summary.last_month.expenses) / summary.last_month.expenses) * 100).toFixed(1) : 0}%
                        </span>
                      </div>
                    </div>
                    <div className="border-t border-[#E6E8F0] pt-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-[#0F172A]">Saldo mês passado</span>
                        <span className={`font-bold ${summary.last_month.balance >= 0 ? "text-[#6366F1]" : "text-red-600"}`}>{formatCurrency(summary.last_month.balance)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {summary && summary.categories.length > 0 && (
              <div className="card p-5">
                <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-[#64748B]">Categorias</h3>
                <div className="flex flex-wrap gap-2">
                  {summary.categories.map((cat) => (
                    <span key={cat.id} className="rounded-xl border border-[#E6E8F0] bg-white px-3 py-1.5 text-sm text-[#475569]">{cat.name}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <select className="input w-auto" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                <option value="">Todos os tipos</option>
                <option value="INCOME">Receitas</option>
                <option value="EXPENSE">Despesas</option>
              </select>
              <select className="input w-auto" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="">Todos os status</option>
                <option value="REAL">Realizado</option>
                <option value="PLANNED">Previsto</option>
              </select>
            </div>

            {filteredTransactions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-[#94A3B8]">
                <Wallet className="mb-3 h-12 w-12" />
                <p className="text-sm">Nenhuma transação encontrada</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredTransactions.map((t) => (
                  <div key={t.id} className="card flex items-center gap-4 p-4 transition-colors hover:bg-slate-50/50">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${t.type === "INCOME" ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"}`}>
                      {t.type === "INCOME" ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-[#0F172A]">{t.description}</h3>
                        {t.status === "PLANNED" && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">Previsto</span>}
                        {t.recurrence !== "NONE" && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700">{t.recurrence}</span>}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-[#64748B]">
                        <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />{new Date(t.date).toLocaleDateString("pt-BR")}</span>
                        {t.category && <span>{t.category}</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold ${t.type === "INCOME" ? "text-green-600" : "text-red-600"}`}>{t.type === "INCOME" ? "+" : "-"}{formatCurrency(t.amount)}</p>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => { setEditingTransaction(t); setShowModal(true); }} className="rounded-xl p-2 text-[#94A3B8] hover:bg-slate-100"><Edit3 className="h-4 w-4" /></button>
                      <button onClick={() => { if (confirm(`Remover "${t.description}"?`)) handleDelete(t.id); }} className="rounded-xl p-2 text-[#94A3B8] hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showModal && (
        <TransactionModal transaction={editingTransaction} onClose={() => { setShowModal(false); setEditingTransaction(null); }} onSave={handleSave} onDelete={handleDelete} />
      )}
    </DashboardShell>
  );
}