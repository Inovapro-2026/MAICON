'use client';

import { motion } from 'framer-motion';
import { PhoneCall, Mail, Check } from 'lucide-react';

export interface ChatMessage {
  id: string;
  channel: 'WHATSAPP' | 'EMAIL';
  direction: 'IN' | 'OUT';
  content: string;
  status: string;
  created_at: string;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/**
 * Bolha de mensagem estilo WhatsApp/Telegram.
 * - Agente (OUT): verde escuro, entra deslizando da direita.
 * - Lead (IN):    cinza, entra deslizando da esquerda.
 */
export function MessageBubble({ message: m }: { message: ChatMessage }) {
  const isOut = m.direction === 'OUT';

  return (
    <motion.div
      initial={{ opacity: 0, x: isOut ? 28 : -28, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ duration: 0.32, ease: 'easeOut' }}
      layout="position"
      className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm shadow-[0_2px_8px_rgba(15,23,42,0.04)] sm:max-w-[75%] ${
          isOut
            ? 'rounded-br-sm bg-[#10B981] text-white'
            : 'rounded-bl-sm border border-[#E6E8F0] bg-white text-[#0F172A]'
        }`}
      >
        <div className="whitespace-pre-wrap break-words">{m.content}</div>
        <div className={`mt-1 flex items-center justify-end gap-1.5 text-[10px] ${isOut ? 'text-white/80' : 'text-[#94A3B8]'}`}>
          {m.channel === 'WHATSAPP' ? <PhoneCall className="h-3 w-3 opacity-70" /> : <Mail className="h-3 w-3 opacity-70" />}
          {formatTime(m.created_at)}
          {isOut && m.status === 'SENT' && <Check className="h-3 w-3 text-white" />}
        </div>
      </div>
    </motion.div>
  );
}