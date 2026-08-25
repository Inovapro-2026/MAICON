'use client';

import { motion } from 'framer-motion';

/** "Pulso de 3 pontinhos" exibido enquanto a IA está pensando. */
export function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="float-left mr-auto flex w-fit items-center gap-1.5 rounded-2xl rounded-bl-sm border border-[#E6E8F0] bg-white px-4 py-3 shadow-[0_2px_8px_rgba(15,23,42,0.04)]"
      aria-label="A IA está digitando…"
    >
      <span className="typing-dot h-2 w-2 rounded-full bg-[#6366F1]" />
      <span className="typing-dot h-2 w-2 rounded-full bg-[#6366F1]" />
      <span className="typing-dot h-2 w-2 rounded-full bg-[#6366F1]" />
    </motion.div>
  );
}