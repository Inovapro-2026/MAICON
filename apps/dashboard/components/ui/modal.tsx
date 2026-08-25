'use client';

import * as React from 'react';
import { X } from 'lucide-react';

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#E6E8F0] bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between border-b border-[#F1F5F9] pb-3">
          <h3 className="text-base font-bold text-[#0F172A]">{title}</h3>
          <button onClick={onClose} className="rounded-xl p-1 text-[#64748B] hover:bg-slate-100 hover:text-[#0F172A] transition-colors" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="text-sm text-[#334155]">{children}</div>
        {footer ? <div className="mt-6 flex justify-end gap-2 border-t border-[#F1F5F9] pt-4">{footer}</div> : null}
      </div>
    </div>
  );
}

