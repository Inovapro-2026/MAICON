import type { Metadata } from "next";
import Link from "next/link";
import {
  Radar,
  Bot,
  HandCoins,
  HeartHandshake,
  MessageSquareText,
  Inbox,
  BarChart3,
  CreditCard,
  Store,
  Sparkles,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { VitrinePlans } from "@/components/vitrine/vitrine-plans";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://crm.inovapro.cloud";

export const metadata: Metadata = {
  title: "Seu negócio está perdendo clientes todos os dias — SAVYRON",
  description:
    "Enquanto você trabalha, o SAVYRON prospecta novos clientes, inicia conversas e engaja automaticamente. Prospecte. Engaje. Venda. Atenda.",
  openGraph: {
    title: "SAVYRON — Prospecte. Engaje. Venda. Atenda.",
    description:
      "Enquanto você trabalha, o SAVYRON prospecta novos clientes, inicia conversas e engaja automaticamente.",
    url: `${APP_URL}/vitrine`,
    siteName: "SAVYRON",
    locale: "pt_BR",
    type: "website",
    images: [
      {
        url: `${APP_URL}/logo-og.png`,
        width: 1200,
        height: 630,
        alt: "SAVYRON",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "SAVYRON — Prospecte. Engaje. Venda. Atenda.",
    description:
      "Enquanto você trabalha, o SAVYRON prospecta novos clientes, inicia conversas e engaja automaticamente.",
    images: [`${APP_URL}/logo-og.png`],
  },
  robots: { index: true, follow: true },
};

const STEPS = [
  {
    icon: Radar,
    title: "Prospecte",
    text: "Enquanto você trabalha, o SAVYRON encontra e organiza novos clientes para o seu negócio.",
  },
  {
    icon: Bot,
    title: "Engaje",
    text: "A inteligência artificial inicia conversas, entende cada cliente e responde dúvidas.",
  },
  {
    icon: HandCoins,
    title: "Venda",
    text: "Apresenta soluções e ajuda a transformar conversas em vendas.",
  },
  {
    icon: HeartHandshake,
    title: "Atenda",
    text: "Depois da venda, o SAVYRON continua atendendo e oferecendo suporte.",
  },
];

const SEGMENTS = [
  "Barbearia",
  "Salão",
  "Clínica",
  "Restaurante",
  "Imobiliária",
  "Loja",
  "E qualquer outro negócio",
];

const FEATURES = [
  {
    icon: Radar,
    title: "Prospecção automática de leads",
    text: "Importe contatos e deixe as campanhas fazerem o primeiro contato automaticamente, no seu ritmo.",
  },
  {
    icon: Bot,
    title: "IA configurável por empresa",
    text: "Treine a IA com a base de conhecimento do seu negócio para que ela responda como a sua equipe.",
  },
  {
    icon: MessageSquareText,
    title: "WhatsApp integrado",
    text: "Converse com os clientes direto no WhatsApp, de onde eles já estão.",
  },
  {
    icon: Inbox,
    title: "Mensagens unificadas",
    text: "Todas as conversas em um só lugar, em tempo real, sem perder nenhuma mensagem.",
  },
  {
    icon: BarChart3,
    title: "Relatórios",
    text: "Acompanhe o desempenho das campanhas e o engajamento de cada contato.",
  },
  {
    icon: CreditCard,
    title: "Planos com PIX ou cartão",
    text: "Contrate o plano que cabe no seu negócio e pague como preferir, com segurança.",
  },
];

function CtaButton({
  children,
  href,
  variant = "primary",
  className = "",
}: {
  children: React.ReactNode;
  href: string;
  variant?: "primary" | "outline";
  className?: string;
}) {
  const base =
    "inline-flex items-center justify-center rounded-xl px-7 py-3.5 text-sm font-semibold transition-colors";
  const styles =
    variant === "primary"
      ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/20 hover:bg-emerald-700"
      : "border border-zinc-300 bg-white text-zinc-800 hover:border-emerald-600 hover:text-emerald-700";
  return (
    <Link href={href} className={`${base} ${styles} ${className}`}>
      {children}
    </Link>
  );
}

function SectionTitle({
  kicker,
  title,
  subtitle,
}: {
  kicker: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mx-auto mb-12 max-w-2xl text-center">
      <div className="mb-3 text-xs font-bold uppercase tracking-widest text-emerald-600">
        {kicker}
      </div>
      <h2 className="font-display text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
        {title}
      </h2>
      {subtitle ? (
        <p className="mt-3 text-base text-zinc-500 sm:text-lg">{subtitle}</p>
      ) : null}
    </div>
  );
}

export default function VitrinePage() {
  return (
    <div className="min-h-screen bg-white text-zinc-900">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-zinc-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/vitrine" aria-label="SAVYRON">
            <Logo height={40} />
          </Link>
          <nav className="hidden items-center gap-8 text-sm font-medium text-zinc-600 sm:flex">
            <a
              href="#como-funciona"
              className="transition-colors hover:text-zinc-900"
            >
              Como funciona
            </a>
            <a
              href="#para-quem"
              className="transition-colors hover:text-zinc-900"
            >
              Para quem é
            </a>
            <a
              href="#recursos"
              className="transition-colors hover:text-zinc-900"
            >
              Recursos
            </a>
            <a href="#planos" className="transition-colors hover:text-zinc-900">
              Planos
            </a>
          </nav>
          <Link
            href="/login"
            className="text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900"
          >
            Entrar
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-gradient-to-b from-emerald-500/10 to-transparent"
        />
        <div className="relative mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 sm:py-28">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-600/20 bg-emerald-500/10 px-4 py-1.5 text-xs font-semibold text-emerald-700">
            <Sparkles className="h-3.5 w-3.5" />
            Prospecção comercial automatizada
          </div>
          <h1 className="font-display text-4xl font-black leading-[1.1] tracking-tight text-zinc-900 sm:text-6xl">
            Seu negócio está perdendo{" "}
            <span className="text-emerald-600">clientes todos os dias.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-zinc-600 sm:text-xl">
            Enquanto você trabalha, o SAVYRON prospecta novos clientes, inicia
            conversas e engaja automaticamente — usando inteligência artificial
            para entender cada cliente, responder dúvidas, apresentar soluções e
            ajudar a transformar conversas em vendas.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <CtaButton href="/signup" className="w-full sm:w-auto">
              Criar minha conta
            </CtaButton>
            <CtaButton
              href="#planos"
              variant="outline"
              className="w-full sm:w-auto"
            >
              Ver planos
            </CtaButton>
          </div>
          <p className="mt-6 text-sm text-zinc-500">
            Sem cartão para começar · Configuração rápida · Cancele quando
            quiser
          </p>
        </div>
      </section>

      {/* Como funciona */}
      <section
        id="como-funciona"
        className="border-t border-zinc-200/80 bg-zinc-50"
      >
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <SectionTitle
            kicker="Como funciona"
            title="Um sistema completo, do primeiro contato ao suporte"
            subtitle="E não para por aí. Depois da venda, o SAVYRON continua atendendo e oferecendo suporte."
          />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <div
                key={title}
                className="relative rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/15">
                  <Icon className="h-6 w-6 text-emerald-600" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-display text-sm font-black text-emerald-600">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="font-display text-lg font-bold text-zinc-900">
                    {title}
                  </h3>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                  {text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Para quem é */}
      <section id="para-quem" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <SectionTitle
          kicker="Para quem é"
          title="Feito para negócios de todos os tamanhos"
          subtitle="O SAVYRON é horizontal: funciona para qualquer negócio que dependa de atender bem os clientes."
        />
        <div className="flex flex-wrap items-center justify-center gap-3">
          {SEGMENTS.map((segment) => (
            <span
              key={segment}
              className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-5 py-2.5 text-sm font-medium text-zinc-700 shadow-sm"
            >
              {segment !== "E qualquer outro negócio" ? (
                <Store className="h-4 w-4 text-emerald-600" />
              ) : null}
              {segment}
            </span>
          ))}
        </div>
      </section>

      {/* Recursos */}
      <section id="recursos" className="border-t border-zinc-200/80 bg-zinc-50">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <SectionTitle
            kicker="Recursos"
            title="Tudo o que você precisa para vender mais"
            subtitle="Funcionalidades reais da plataforma, prontas para usar."
          />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div
                key={title}
                className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15">
                  <Icon className="h-5 w-5 text-emerald-600" />
                </div>
                <h3 className="font-display text-base font-bold text-zinc-900">
                  {title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                  {text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Planos */}
      <section id="planos" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <SectionTitle
          kicker="Planos"
          title="Escolha o plano que cabe no seu negócio"
          subtitle="Preços atualizados direto da plataforma. Pague com PIX ou cartão."
        />
        <VitrinePlans />
        <div className="mt-10 text-center">
          <CtaButton href="/signup" className="w-full sm:w-auto">
            Criar minha conta
          </CtaButton>
        </div>
      </section>

      {/* CTA final */}
      <section className="relative overflow-hidden border-t border-zinc-200/80 bg-zinc-900">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-600/20 via-transparent to-emerald-600/10"
        />
        <div className="relative mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
          <div className="mx-auto mb-8 w-fit">
            <Logo height={64} priority={false} />
          </div>
          <p className="font-display text-3xl font-black tracking-tight text-white sm:text-5xl">
            SAVYRON.
            <br />
            Prospecte. Engaje. Venda. Atenda.
          </p>
          <p className="mx-auto mt-5 max-w-xl text-base text-zinc-300 sm:text-lg">
            Comece hoje a recuperar os clientes que você perde todos os dias.
          </p>
          <div className="mt-10">
            <CtaButton href="/signup" className="w-full sm:w-auto">
              Criar minha conta agora
            </CtaButton>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-200/80 bg-zinc-50">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-10 sm:flex-row sm:px-6">
          <Link href="/vitrine" aria-label="SAVYRON">
            <Logo height={44} priority={false} />
          </Link>
          <div className="flex items-center gap-6 text-sm text-zinc-500">
            <Link
              href="/login"
              className="transition-colors hover:text-zinc-900"
            >
              Entrar
            </Link>
            <a href="#planos" className="transition-colors hover:text-zinc-900">
              Planos
            </a>
          </div>
          <div className="text-sm text-zinc-500">
            © {new Date().getFullYear()} SAVYRON
          </div>
        </div>
      </footer>
    </div>
  );
}
