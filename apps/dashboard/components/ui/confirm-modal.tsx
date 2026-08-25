'use client';

import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: React.ReactNode;
  /** Texto que o usuário deve digitar para habilitar o botão de confirmação (passo 2). */
  confirmText?: string;
  confirmLabel?: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Modal de confirmação reforçada para ações destrutivas de alto risco.
 * Quando `confirmText` é informado, exige digitar o texto exato antes de
 * habilitar o botão de confirmação (proteção contra clique acidental).
 */
export function ConfirmModal({
  open,
  title,
  message,
  confirmText,
  confirmLabel = 'Confirmar',
  loading = false,
  onCancel,
  onConfirm,
}: ConfirmModalProps) {
  const [typed, setTyped] = React.useState('');

  React.useEffect(() => {
    if (open) setTyped('');
  }, [open]);

  const enabled = confirmText ? typed === confirmText : true;

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={!enabled || loading} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50/80 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div className="text-sm text-[#334155]">{message}</div>
        </div>
        {confirmText ? (
          <div>
            <label className="label">
              Digite <strong className="text-[#0F172A]">{confirmText}</strong> para confirmar
            </label>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="input font-mono"
              placeholder={confirmText}
              autoComplete="off"
              autoFocus
            />
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

