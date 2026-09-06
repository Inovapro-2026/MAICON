"use client";

import { useMemo } from "react";

export interface ChatMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}

interface ConversationBubbleProps {
  message: ChatMessage;
}

export function ConversationBubble({ message }: ConversationBubbleProps) {
  const isUser = message.role === "user";

  const timeString = useMemo(() => {
    if (message.timestamp) return message.timestamp;
    const now = new Date();
    return now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }, [message.timestamp]);

  return (
    <div
      className={`w-full max-w-xl mx-auto rounded-2xl p-4 sm:p-5 transition-all duration-300 animate-in fade-in slide-in-from-bottom-2 ${
        isUser
          ? "agent-glass-card border-[#38BDF8]/30 bg-[#070B28]/75 shadow-[0_4px_20px_rgba(56,189,248,0.08)]"
          : "agent-glass-card border-[#A855F7]/35 bg-[#0A0F37]/80 shadow-[0_4px_25px_rgba(168,85,247,0.12)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1.5">
            
          </div>
          <p className="text-sm sm:text-base text-[#F8FAFC] leading-relaxed font-normal">
            {message.content}
          </p>
        </div>
        <span className="shrink-0 text-[11px] font-medium text-[#64748B] pt-0.5">
          {timeString}
        </span>
      </div>
    </div>
  );
}

interface ConversationListProps {
  history: ChatMessage[];
  transcript?: string;
  lastAssistant?: string;
}

export function ConversationList({
  history,
  transcript,
  lastAssistant,
}: ConversationListProps) {
  // Apenas a pergunta e resposta atual — quando uma nova chega, a anterior
  // desaparece. Mantém altura fixa para não estender a página.
  const activeItems: ChatMessage[] = useMemo(() => {
    const items: ChatMessage[] = [];
    if (transcript) {
      items.push({ role: "user", content: transcript });
    }
    if (lastAssistant) {
      items.push({ role: "assistant", content: lastAssistant });
    }
    return items;
  }, [transcript, lastAssistant]);

  if (activeItems.length === 0) return null;

  return (
    <div className="w-full max-w-xl mx-auto space-y-3 px-4 h-48 overflow-y-auto">
      {activeItems.map((item, idx) => (
        <ConversationBubble key={item.id ?? idx} message={item} />
      ))}
    </div>
  );
}
