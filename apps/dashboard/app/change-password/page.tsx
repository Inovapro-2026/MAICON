'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/logo';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError('As senhas não coincidem');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data?.error?.message ?? 'Falha ao alterar a senha');
        setLoading(false);
        return;
      }
      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('Não foi possível conectar ao servidor');
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4">
      <div className="mb-8">
        <Logo />
      </div>
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-center font-display text-2xl font-bold text-zinc-900">Trocar senha</h1>
        <p className="mb-6 text-center text-sm text-zinc-500">Por segurança, defina uma nova senha antes de continuar.</p>
        <form onSubmit={submit} className="space-y-4">
          <Input label="Senha atual" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
          <Input
            label="Nova senha"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            hint="Mínimo 8 caracteres, com maiúscula, número e símbolo."
            required
          />
          <Input label="Confirmar nova senha" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
          {error ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600">{error}</div>
          ) : null}
          <Button type="submit" className="w-full" loading={loading}>
            Salvar e continuar
          </Button>
        </form>
      </div>
    </div>
  );
}
