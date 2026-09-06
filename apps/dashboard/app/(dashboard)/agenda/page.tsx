"use client";

import { useState, useEffect, useCallback } from "react";
import { DashboardShell } from "@/components/layout/shell";
import { Calendar, ChevronLeft, ChevronRight, Plus, Clock, Repeat, Trash2, Edit3, X, AlertCircle } from "lucide-react";

const API_BASE = "/api/proxy";

interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string | null;
  all_day: boolean;
  category: string | null;
  priority: string;
  status: string;
  recurrence: string;
  reminder_minutes_before: number | null;
}

interface Reminder {
  id: string;
  title: string;
  description: string | null;
  remind_at: string;
  recurring: boolean;
  recurrence: string;
  status: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  LOW: "bg-gray-100 text-gray-600 border-gray-200",
  NORMAL: "bg-blue-100 text-blue-600 border-blue-200",
  HIGH: "bg-amber-100 text-amber-600 border-amber-200",
  URGENT: "bg-red-100 text-red-600 border-red-200",
};

const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: "bg-slate-100 text-slate-600",
  CONFIRMED: "bg-green-100 text-green-600",
  COMPLETED: "bg-emerald-100 text-emerald-600",
  CANCELLED: "bg-red-100 text-red-400",
};

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function EventModal({ event, onClose, onSave, onDelete }: {
  event?: CalendarEvent | null;
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(event?.title ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const now = new Date();
  const defaultDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const [startDate, setStartDate] = useState(event?.start_date ? new Date(event.start_date).toISOString().slice(0, 16) : defaultDate);
  const [endDate, setEndDate] = useState(event?.end_date ? new Date(event.end_date).toISOString().slice(0, 16) : "");
  const [allDay, setAllDay] = useState(event?.all_day ?? false);
  const [category, setCategory] = useState(event?.category ?? "");
  const [priority, setPriority] = useState(event?.priority ?? "NORMAL");
  const [recurrence, setRecurrence] = useState(event?.recurrence ?? "NONE");
  const [reminder, setReminder] = useState(event?.reminder_minutes_before ?? 15);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError("Título é obrigatório"); return; }
    setSaving(true);
    setError("");
    try {
      const startISO = new Date(startDate).toISOString();
      const endISO = endDate ? new Date(endDate).toISOString() : null;
      await onSave({
        title: title.trim(),
        description: description.trim() || null,
        start_date: startISO,
        end_date: endISO,
        all_day: allDay,
        category: category || null,
        priority,
        recurrence,
        reminder_minutes_before: reminder ? Number(reminder) : null,
      });
      onClose();
    } catch (e: any) {
      setError(e.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-[#E6E8F0]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[#0F172A]">{event ? "Editar evento" : "Novo evento"}</h2>
          <button onClick={onClose} className="rounded-xl p-2 text-[#94A3B8] hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        {error && <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-600"><AlertCircle className="h-4 w-4" />{error}</div>}
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="label">Título</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nome do evento" required />
          </div>
          <div>
            <label className="label">Descrição</label>
            <textarea className="input min-h-[80px] resize-y" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrição (opcional)" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Data e hora</label>
              <input className="input" type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
            </div>
            <div>
              <label className="label">Término (opcional)</label>
              <input className="input" type="datetime-local" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="allDay" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="h-4 w-4 rounded border-[#E6E8F0] text-[#6366F1]" />
            <label htmlFor="allDay" className="text-sm text-[#475569]">Dia inteiro</label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Categoria</label>
              <input className="input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Ex.: reunião, tarefa" />
            </div>
            <div>
              <label className="label">Prioridade</label>
              <select className="input" value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="LOW">Baixa</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">Alta</option>
                <option value="URGENT">Urgente</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
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
            <div>
              <label className="label">Lembrete (min)</label>
              <input className="input" type="number" value={reminder} onChange={(e) => setReminder(Number(e.target.value))} placeholder="15" min={0} />
            </div>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? "Salvando..." : "Salvar"}</button>
            {event && onDelete && (
              <button type="button" onClick={() => { if (confirm("Remover este evento?")) onDelete(event.id); }} className="btn-danger px-4"><Trash2 className="h-4 w-4" /></button>
            )}
            <button type="button" onClick={onClose} className="btn-outline px-4">Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AgendaPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "month">("list");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [activeTab, setActiveTab] = useState<"events" | "reminders">("events");
  const [refreshKey, setRefreshKey] = useState(0);

  const doFetchEvents = useCallback(async () => {
    const start = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).toISOString();
    const end = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0, 23, 59, 59).toISOString();
    const res = await fetch(`${API_BASE}/calendar/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
    const data = await res.json();
    if (data.success) setEvents(data.data.events ?? []);
  }, [currentMonth]);

  const doFetchReminders = useCallback(async () => {
    const res = await fetch(`${API_BASE}/calendar/reminders`);
    const data = await res.json();
    if (data.success) setReminders(data.data.reminders ?? []);
  }, []);

  useEffect(() => {
    setLoading(true);
    setError("");
    Promise.all([
      doFetchEvents().catch(() => { setError("Erro ao carregar eventos"); return; }),
      doFetchReminders().catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [doFetchEvents, doFetchReminders, refreshKey]);

  const handleSave = async (eventData: any) => {
    const url = editingEvent ? `${API_BASE}/calendar/events/${editingEvent.id}` : `${API_BASE}/calendar/events`;
    const method = editingEvent ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(eventData) });
    const data = await res.json();
    if (!data.success) throw new Error(data.error?.message ?? "Erro ao salvar");
    setRefreshKey(k => k + 1);
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`${API_BASE}/calendar/events/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!data.success) throw new Error(data.error?.message ?? "Erro ao remover");
    setRefreshKey(k => k + 1);
  };

  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));

  const todayEvents = events.filter((e) => {
    const today = new Date();
    const eventDate = new Date(e.start_date);
    return eventDate.toDateString() === today.toDateString();
  });

  const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
  const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
  const startDay = monthStart.getDay();
  const daysInMonth = monthEnd.getDate();

  const calendarDays = [];
  for (let i = 0; i < startDay; i++) calendarDays.push(null);
  for (let i = 1; i <= daysInMonth; i++) calendarDays.push(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i));

  return (
    <DashboardShell title="Agenda">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Calendar className="h-6 w-6 text-[#6366F1]" />
            <h1 className="text-2xl font-bold text-[#0F172A]">Agenda</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-xl border border-[#E6E8F0] overflow-hidden">
              <button onClick={() => setViewMode("list")} className={`px-3 py-1.5 text-sm font-medium transition-colors ${viewMode === "list" ? "bg-[#EEF2FF] text-[#6366F1]" : "text-[#64748B] hover:bg-slate-50"}`}>Lista</button>
              <button onClick={() => setViewMode("month")} className={`px-3 py-1.5 text-sm font-medium transition-colors ${viewMode === "month" ? "bg-[#EEF2FF] text-[#6366F1]" : "text-[#64748B] hover:bg-slate-50"}`}>Mês</button>
            </div>
            <button onClick={() => { setEditingEvent(null); setShowModal(true); }} className="btn-primary flex items-center gap-2"><Plus className="h-4 w-4" /> Novo evento</button>
          </div>
        </div>

        {error && <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600"><AlertCircle className="h-4 w-4" />{error}</div>}

        {todayEvents.length > 0 && (
          <div className="rounded-2xl border border-[#E6E8F0] bg-gradient-to-r from-[#EEF2FF] to-white p-4">
            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-[#6366F1]">Hoje</div>
            {todayEvents.map((e) => (
              <div key={e.id} className="flex items-center gap-3 text-sm text-[#475569]">
                <Clock className="h-4 w-4 text-[#6366F1]" />
                <span className="font-medium">{formatTime(e.start_date)}</span>
                <span>{e.title}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-1 rounded-xl border border-[#E6E8F0] p-1 w-fit">
          <button onClick={() => setActiveTab("events")} className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${activeTab === "events" ? "bg-white text-[#0F172A] shadow-sm" : "text-[#64748B] hover:text-[#0F172A]"}`}>Eventos</button>
          <button onClick={() => setActiveTab("reminders")} className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${activeTab === "reminders" ? "bg-white text-[#0F172A] shadow-sm" : "text-[#64748B] hover:text-[#0F172A]"}`}>Lembretes</button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-[#94A3B8]">Carregando...</div>
        ) : activeTab === "events" ? (
          viewMode === "list" ? (
            <div className="space-y-3">
              {events.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-[#94A3B8]">
                  <Calendar className="mb-3 h-12 w-12" />
                  <p className="text-sm">Nenhum evento neste mês</p>
                </div>
              ) : events.map((event) => (
                <div key={event.id} className="card flex items-start gap-4 p-4 transition-colors hover:bg-slate-50/50">
                  <div className="flex min-w-[60px] flex-col items-center rounded-xl bg-[#EEF2FF] px-3 py-2">
                    <span className="text-xs font-bold uppercase text-[#6366F1]">{new Date(event.start_date).toLocaleDateString("pt-BR", { month: "short" })}</span>
                    <span className="text-2xl font-bold text-[#0F172A]">{new Date(event.start_date).getDate()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-[#0F172A]">{event.title}</h3>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${PRIORITY_COLORS[event.priority] ?? PRIORITY_COLORS.NORMAL}`}>{event.priority}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_COLORS[event.status] ?? ""}`}>{event.status}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-[#64748B]">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatTime(event.start_date)}{event.end_date ? ` - ${formatTime(event.end_date)}` : ""}</span>
                      {event.category && <span>{event.category}</span>}
                      {event.recurrence !== "NONE" && <span className="flex items-center gap-1"><Repeat className="h-3 w-3" />{event.recurrence}</span>}
                    </div>
                    {event.description && <p className="mt-1 text-sm text-[#64748B] truncate">{event.description}</p>}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditingEvent(event); setShowModal(true); }} className="rounded-xl p-2 text-[#94A3B8] hover:bg-slate-100"><Edit3 className="h-4 w-4" /></button>
                    <button onClick={() => { if (confirm(`Remover "${event.title}"?`)) handleDelete(event.id); }} className="rounded-xl p-2 text-[#94A3B8] hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-[#E6E8F0] px-4 py-3">
                <button onClick={prevMonth} className="rounded-xl p-2 text-[#64748B] hover:bg-slate-100"><ChevronLeft className="h-5 w-5" /></button>
                <h3 className="font-bold text-[#0F172A]">{currentMonth.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</h3>
                <button onClick={nextMonth} className="rounded-xl p-2 text-[#64748B] hover:bg-slate-100"><ChevronRight className="h-5 w-5" /></button>
              </div>
              <div className="grid grid-cols-7">
                {weekDays.map((d) => <div key={d} className="border-b border-[#E6E8F0] px-2 py-2 text-center text-[11px] font-bold uppercase text-[#94A3B8]">{d}</div>)}
                {calendarDays.map((day, i) => {
                  const dayEvents = day ? events.filter((e) => new Date(e.start_date).toDateString() === day.toDateString()) : [];
                  const isToday = day && day.toDateString() === new Date().toDateString();
                  return (
                    <div key={i} className={`min-h-[100px] border-b border-r border-[#E6E8F0] p-1.5 transition-colors ${isToday ? "bg-[#EEF2FF]" : "hover:bg-slate-50"}`}>
                      {day && (
                        <>
                          <div className={`mb-1 flex h-7 w-7 items-center justify-center rounded-full text-sm ${isToday ? "bg-[#6366F1] text-white font-bold" : "text-[#475569]"}`}>{day.getDate()}</div>
                          {dayEvents.slice(0, 3).map((e) => (
                            <div key={e.id} className="mb-0.5 truncate rounded-md bg-[#EEF2FF] px-1.5 py-0.5 text-[10px] font-medium text-[#6366F1] cursor-pointer hover:bg-[#DDE3FF]" title={e.title}>
                              {e.all_day ? "" : formatTime(e.start_date) + " "}{e.title}
                            </div>
                          ))}
                          {dayEvents.length > 3 && <div className="text-[10px] text-[#94A3B8]">+{dayEvents.length - 3} mais</div>}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )
        ) : (
          <div className="space-y-3">
            {reminders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-[#94A3B8]">
                <Clock className="mb-3 h-12 w-12" />
                <p className="text-sm">Nenhum lembrete pendente</p>
              </div>
            ) : reminders.map((r) => (
              <div key={r.id} className="card flex items-center gap-4 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
                  <Clock className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-[#0F172A]">{r.title}</h3>
                  <p className="text-xs text-[#64748B]">{new Date(r.remind_at).toLocaleDateString("pt-BR")} {new Date(r.remind_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}{r.recurring ? ` · Repete: ${r.recurrence}` : ""}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${r.status === "PENDING" ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>{r.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <EventModal event={editingEvent} onClose={() => { setShowModal(false); setEditingEvent(null); }} onSave={handleSave} onDelete={handleDelete} />
      )}
    </DashboardShell>
  );
}