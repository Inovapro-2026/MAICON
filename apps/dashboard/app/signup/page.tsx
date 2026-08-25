"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PlanStep } from "@/components/signup/plan-step";
import {
  fetchPlans,
  requestVerificationCode,
  confirmVerificationCode,
  completeSignup,
  OnboardingPlan,
} from "@/lib/onboarding";
import "../auth.css";

type Step = "email" | "details" | "plan";

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");

  // email step
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [codeResendTimer, setCodeResendTimer] = useState(0);

  // details step
  const [businessName, setBusinessName] = useState("");
  const [responsibleName, setResponsibleName] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [segment, setSegment] = useState("");
  const [cpfCnpj, setCpfCnpj] = useState("");

  // plan step
  const [plans, setPlans] = useState<OnboardingPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<string>("");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void fetchPlans().then((p) => {
      setPlans(p);
      if (p.length > 0) setSelectedPlan(p[0].id);
    });
  }, []);

  useEffect(() => {
    if (codeResendTimer <= 0) return;
    const t = setTimeout(() => setCodeResendTimer((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [codeResendTimer]);

  const sendCode = async () => {
    setSendingCode(true);
    setError(null);
    try {
      await requestVerificationCode(email);
      setCodeSent(true);
      setCodeResendTimer(30);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao enviar código");
    } finally {
      setSendingCode(false);
    }
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await confirmVerificationCode(email, code);
      setStep("details");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Código inválido");
    } finally {
      setLoading(false);
    }
  };

  const submitDetails = (e: React.FormEvent) => {
    e.preventDefault();
    setStep("plan");
  };

  const createAccount = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await completeSignup({
        email,
        password,
        businessName,
        responsibleName,
        phone,
        segment,
        planId: selectedPlan || undefined,
        cpfCnpj,
      });
      // Auto-login: grava o token da API no cookie da sessão
      const res = await fetch("/api/auth/session/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: result.token }),
      });
      if (!res.ok) {
        setError("Conta criada, mas a sessão não foi iniciada. Faça login.");
        router.push("/login");
        return;
      }
      router.push("/payment");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar conta");
      setLoading(false);
    }
  };

  return (
    <div className="auth-page-container">
      <div className="auth-card max-w-lg">
      <div className="mb-6 text-center">
        <Link href="/login">
          <Logo />
        </Link>
      </div>
      <div className="w-full">
        <h1 className="mb-1 text-center font-display text-2xl font-bold text-zinc-900">
          Criar conta no SAVYRON
        </h1>
        <p className="mb-6 text-center text-sm text-zinc-500">
          Cadastre sua empresa, verifique seu e-mail e escolha seu plano
        </p>

        <div className="mb-6 flex items-center justify-center gap-2 text-xs">
          {(["email", "details", "plan"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-medium ${
                  step === s || (step !== "email" && i === 0)
                    ? "bg-emerald-500 text-zinc-900"
                    : "bg-zinc-100 text-zinc-500"
                }`}
              >
                {i + 1}
              </span>
              <span className={step === s ? "text-zinc-700" : "text-zinc-500"}>
                {s === "email"
                  ? "E-mail"
                  : s === "details"
                    ? "Empresa"
                    : "Plano"}
              </span>
              {i < 2 && <span className="h-px w-6 bg-zinc-100" />}
            </div>
          ))}
        </div>

        {error ? (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        ) : null}

        {step === "email" && (
          <Card className="p-6">
            <form onSubmit={verifyCode} className="space-y-4">
              <Input
                label="E-mail profissional"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@empresa.com"
                required
                disabled={codeSent}
              />
              {codeSent ? (
                <>
                  <Input
                    label="Código de verificação (6 dígitos)"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="000000"
                    required
                  />
                  <div className="text-xs text-zinc-500">
                    Enviamos um código para{" "}
                    <span className="text-zinc-700">{email}</span>. Ele expira
                    em 10 minutos.
                  </div>
                  {codeResendTimer > 0 ? (
                    <div className="text-xs text-zinc-500">
                      Reenviar em {codeResendTimer}s
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={sendCode}
                      className="text-xs font-medium text-emerald-600 hover:text-emerald-600"
                      disabled={sendingCode}
                    >
                      Reenviar código
                    </button>
                  )}
                  <Button type="submit" className="w-full" loading={loading}>
                    Verificar e continuar
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  onClick={sendCode}
                  className="w-full"
                  loading={sendingCode}
                >
                  Enviar código
                </Button>
              )}
            </form>
          </Card>
        )}

        {step === "details" && (
          <Card className="p-6">
            <form onSubmit={submitDetails} className="space-y-4">
              <Input
                label="Nome da empresa"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Ex.: Barbearia Central"
                required
              />
              <Input
                label="Nome do responsável"
                value={responsibleName}
                onChange={(e) => setResponsibleName(e.target.value)}
                placeholder="Seu nome"
                required
              />
              <Input
                label="Telefone/WhatsApp (opcional)"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(11) 99999-0000"
              />
              <Input
                label="Segmento (opcional)"
                value={segment}
                onChange={(e) => setSegment(e.target.value)}
                placeholder="Ex.: Barbearia, Clínica, Imobiliária..."
              />
              <Input
                label="CPF/CNPJ (necessário para pagamento)"
                value={cpfCnpj}
                onChange={(e) => setCpfCnpj(e.target.value)}
                placeholder="000.000.000-00"
              />
              <Input
                label="Senha (mín. 8, com maiúscula, número e especial)"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={8}
              />
              <Button
                type="submit"
                className="w-full"
                disabled={
                  !businessName.trim() ||
                  !responsibleName.trim() ||
                  password.length < 8
                }
              >
                Continuar
              </Button>
            </form>
          </Card>
        )}

        {step === "plan" && (
          <PlanStep
            plans={plans}
            selectedPlan={selectedPlan}
            onSelect={setSelectedPlan}
            onContinue={createAccount}
            loading={loading}
            error={error}
          />
        )}

        <p className="mt-6 text-center text-sm text-zinc-500">
          Já tem conta?{" "}
          <Link
            href="/login"
            className="font-medium text-emerald-600 hover:text-emerald-600"
          >
            Entrar
          </Link>
        </p>
      </div>
      </div>
    </div>
  );
}
