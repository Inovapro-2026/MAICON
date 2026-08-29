"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import "../auth.css";

interface LoginResponse {
  success: boolean;
  must_change_password?: boolean;
  active_business?: {
    id: string;
    status: string;
    suspension_reason?: string | null;
  } | null;
  error?: { message?: string };
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as LoginResponse;
      if (!res.ok || !data.success) {
        setError(data?.error?.message ?? "Falha no login");
        setLoading(false);
        return;
      }
      if (data.must_change_password) {
        router.push("/change-password");
        router.refresh();
        return;
      }
      const status = data.active_business?.status;
      const suspensionReason = data.active_business?.suspension_reason;
      // SUSPENDED por vencimento de assinatura volta para /payment renovar.
      if (
        status === "PENDING_PAYMENT" ||
        (status === "SUSPENDED" && suspensionReason === "subscription_expired")
      ) {
        router.push("/payment");
        router.refresh();
        return;
      }
      if (status === "SUSPENDED" || status === "CANCELLED") {
        setError(
          status === "SUSPENDED"
            ? "Sua conta está suspensa. Fale com o suporte."
            : "Sua conta foi cancelada. Fale com o suporte.",
        );
        setLoading(false);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Não foi possível conectar ao servidor");
      setLoading(false);
    }
  };

  return (
    <div className="auth-page-container">
      <div className="auth-card max-w-sm">
        <div className="mb-6 text-center">
          <Logo />
        </div>
        <h1 className="auth-title">Entrar</h1>
        <p className="auth-subtitle">Acesso ao SAVYRON</p>
        <form onSubmit={submit} className="space-y-4">
          <Input
            label="E-mail"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@empresa.com"
            required
          />
          <Input
            label="Senha"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}
          <Button type="submit" className="w-full" loading={loading}>
            Entrar
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-zinc-500">
          Ainda não possui uma conta?{" "}
          <Link
            href="/signup"
            className="font-medium text-emerald-700 hover:text-emerald-800"
          >
            Cadastre-se
          </Link>
        </p>
      </div>
    </div>
  );
}
