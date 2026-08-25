'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  BookOpen,
  Check,
  Copy,
  FileText,
  Sparkles,
  Zap,
  ShieldCheck,
  HelpCircle,
  Lightbulb,
  CheckCircle2,
  Building2,
  Stethoscope,
  ShoppingBag,
} from 'lucide-react';
import { DashboardShell } from '@/components/layout/shell';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { useApi } from '@/hooks/use-api';

const TEMPLATE_PROMPT = `[IDENTIDADE E POSICIONAMENTO]
Você é o consultor oficial de atendimento e vendas de [NOME DA EMPRESA], especialista no segmento de [SEGMENTO].
Seu tom de voz deve ser: profissional, consultivo, acolhedor, objetivo e humano (nunca pareça um robô ou chatbot automático).
Seu objetivo principal é entender a necessidade do cliente e conduzi-lo para [OBJETIVO: ex. agendamento de consulta / orçamento / link de compra / contato com consultor humano].

[SOBRE A EMPRESA E DIFERENCIAIS]
- A empresa atua com: [DESCREVA PRODUTOS/SERVIÇOS PRINCIPAIS]
- Nossos principais diferenciais são: [DIFERENCIAIS: ex. atendimento personalizado, tecnologia de ponta, entrega rápida]
- Horário de atendimento: [HORÁRIOS]
- Localização/Área de atendimento: [CIDADE / ESTADO / OU ATENDIMENTO NACIONAL DIGITAL]

[REGRAS CRÍTICAS DE CONVERSAÇÃO NO WHATSAPP]
1. RESPOSTAS CURTAS: Envie mensagens breves (máximo 2 a 4 linhas). No WhatsApp ninguém gosta de textos gigantes.
2. UMA PERGUNTA POR VEZ: Nunca faça duas perguntas na mesma mensagem para não confundir o cliente.
3. ESCUTA ATIVA: Sempre responda primeiro à dúvida do cliente antes de fazer uma nova pergunta ou sugerir um produto.
4. NUNCA DESPEJE TUDO: Não envie todos os serviços ou catálogo de uma vez. Pergunte primeiro o que ele procura.
5. CONDUÇÃO COMERCIAL: Quando o cliente demonstrar interesse, direcione suavemente para o próximo passo (ex.: "Posso agendar um horário para você?", "Quer que eu envie o link direto da nossa vitrine?").
6. NUNCA INVENTE FATOS: Se não souber um preço, prazo ou informação específica, diga educadamente que vai confirmar com a equipe e avise que pode transferir para um atendente humano.
7. TRANSBORDO HUMANO: Se o cliente pedir para falar com uma pessoa real ou em situações complexas, avise que um especialista humano já está assumindo.`;

const CLINICA_EXAMPLE = `[IDENTIDADE E POSICIONAMENTO]
Você é a atendente virtual da Clínica Sorriso & Arte, referência em odontologia estética e implantes em São Paulo.
Tom de voz: muito atencioso, educado, claro e profissional.
Objetivo: tirar dúvidas iniciais dos pacientes e agendar uma avaliação na clínica.

[SOBRE A CLÍNICA]
- Especialidades: Implantes dentários, Alinhadores invisíveis, Clareamento a laser, Lentes de resina e Próteses.
- Diferenciais: Tecnologia 3D sem dor, parcelamento facilitado em até 24x e estacionamento gratuito no local.
- Endereço: Av. Paulista, 1000 - Bela Vista, São Paulo/SP.
- Horário: Segunda a Sexta das 08h às 19h e Sábados das 08h às 13h.

[REGRAS DE CONDUTA]
- Nunca passe valores exatos de tratamentos complexos (como implantes) sem avaliação prévia do dentista. Explique com simpatia que cada caso é único e convide para a consulta de avaliação.
- Mantenha mensagens curtas (2 a 3 frases).
- Faça sempre apenas uma pergunta por vez.
- Ofereça opções de dias e períodos (manhã ou tarde) para facilitar o agendamento do paciente.`;

const SAAS_EXAMPLE = `[IDENTIDADE E POSICIONAMENTO]
Você é o assistente comercial oficial da SAVYRON, a plataforma de inteligência comercial com IA que revoluciona a prospecção e vendas para empresas.
Tom de voz: consultivo, inovador, dinâmico e focado no crescimento do cliente.
Objetivo: qualificar o perfil do cliente e convidá-lo a testar a plataforma ou assinar um plano.

[SOBRE A PLATAFORMA]
- O que faz: Prospecção inteligente de leads B2B, automação multicanal (WhatsApp e E-mail), CRM integrado e atendentes de IA que respondem 24/7.
- Para quem serve: Clínicas, escritórios, agências, comércios, corretores e prestadores de serviços.
- Planos e Teste: Planos acessíveis mensais sem fidelidade, com teste prático imediato.

[REGRAS DE CONDUTA]
- Entenda primeiro o segmento e a maior dor do cliente (ex.: "Você precisa de mais clientes chegando ou de automação para responder rápido?").
- Apresente apenas a solução que resolve a dor dele.
- Quando demonstrar interesse, envie o link de cadastro ou ofereça uma demonstração guiada.`;

const BEST_PRACTICES = [
  {
    title: 'Mensagens Curtas & Diretas',
    desc: 'No WhatsApp, mensagens com mais de 4 linhas parecem panfletos e são ignoradas. Oriente a IA a falar como um atendente real digitando no celular.',
  },
  {
    title: 'Uma Única Pergunta por Vez',
    desc: 'Fazer várias perguntas trava o cliente. Deixe a conversa fluir em turnos rápidos de pergunta e resposta.',
  },
  {
    title: 'Validação de Fatos & Segurança',
    desc: 'Instrua a IA a nunca prometer o que sua empresa não cumpre ou inventar dados técnicos não fornecidos na configuração.',
  },
  {
    title: 'Até 15.000 Caracteres de Contexto',
    desc: 'Aproveite o novo limite expandido para colocar regras completas, tabela de serviços, políticas de garantia, FAQ de dúvidas e horários.',
  },
];

export default function PromptGuidePage() {
  const { success } = useToast();
  const [copiedTemplate, setCopiedTemplate] = useState(false);
  const [copiedClinica, setCopiedClinica] = useState(false);
  const [copiedSaas, setCopiedSaas] = useState(false);
  const [useBusinessData, setUseBusinessData] = useState(true);

  const business = useApi<{
    name: string | null;
    segment: string | null;
  }>(['business-settings'], 'business/settings');

  const formattedTemplate = useMemo(() => {
    if (!useBusinessData) return TEMPLATE_PROMPT;
    const name = business.data?.name?.trim();
    const segment = business.data?.segment?.trim();
    if (!name && !segment) return TEMPLATE_PROMPT;
    return TEMPLATE_PROMPT
      .replace('[NOME DA EMPRESA]', name || '[NOME DA EMPRESA]')
      .replace('[SEGMENTO]', segment || '[SEGMENTO]');
  }, [business.data, useBusinessData]);

  const copyText = async (text: string, setFn: (v: boolean) => void, msg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setFn(true);
      success(msg);
      setTimeout(() => setFn(false), 2000);
    } catch {
      success('Texto selecionado. Copie usando Ctrl+C.');
    }
  };

  return (
    <DashboardShell title="Guia de Prompts do SAVYRON">
      <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <Link
            href="/settings/empresa-ia"
            className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-[#6366F1] hover:text-[#4F46E5] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para Configuração da IA
          </Link>
          <h1 className="text-2xl font-black tracking-tight text-[#0F172A]">
            Guia de Prompts para o SAVYRON
          </h1>
          <p className="mt-1 text-sm text-[#64748B]">
            Como estruturar as regras e a descrição da sua IA para obter conversas naturais, humanas e de alta conversão em vendas.
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Banner de Destaque com o limite de 15.000 caracteres */}
        <div className="relative overflow-hidden rounded-2xl border border-[#C7D2FE] bg-gradient-to-br from-white via-[#F8FAFC] to-[#EEF2FF] p-6 shadow-xs">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#6366F1] text-white shadow-md">
              <Sparkles className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-[#0F172A]">
                  Campo Único Expandido: Até 15.000 Caracteres
                </h3>
                <span className="rounded-full bg-[#ECFDF5] px-2.5 py-0.5 text-[10px] font-extrabold text-[#10B981] border border-[#A7F3D0]">
                  Novo Limite
                </span>
              </div>
              <p className="mt-1 text-xs text-[#475569] leading-relaxed">
                O campo <strong>"Descrição da empresa / instrução de comportamento da IA"</strong> agora suporta até 15.000 caracteres. Você pode incluir toda a identidade da empresa, regras de atendimento, perguntas frequentes (FAQ), lista de serviços e tratamento de objeções em um só lugar.
              </p>
            </div>
          </div>
        </div>

        {/* 4 Pilares de Boas Práticas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {BEST_PRACTICES.map((item, idx) => (
            <div
              key={idx}
              className="rounded-2xl border border-[#E6E8F0] bg-white p-4 shadow-xs transition-all hover:border-[#C7D2FE] hover:shadow-md"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EEF2FF] text-[#6366F1] font-bold text-xs mb-3">
                {idx + 1}
              </div>
              <h4 className="text-xs font-bold text-[#0F172A] mb-1">{item.title}</h4>
              <p className="text-[11px] text-[#64748B] leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>

        {/* Prompt Modelo Principal */}
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E6E8F0] p-5 bg-[#F8FAFC]">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ECFDF5] text-[#10B981]">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#0F172A]">Prompt-Modelo Mestre (Copie e Cole)</h3>
                <p className="text-xs text-[#64748B]">
                  Estrutura universal completa testada e otimizada para atendimento comercial via WhatsApp.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6E8F0] bg-white px-3 py-1.5 text-xs font-medium text-[#475569] shadow-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={useBusinessData}
                  onChange={(e) => setUseBusinessData(e.target.checked)}
                  className="accent-[#6366F1] rounded"
                />
                Inserir nome do meu negócio
              </label>
              <button
                type="button"
                onClick={() => void copyText(formattedTemplate, setCopiedTemplate, 'Prompt-modelo copiado!')}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#6366F1] hover:bg-[#4F46E5] px-4 py-2 text-xs font-bold text-white shadow-xs transition-all"
              >
                {copiedTemplate ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copiedTemplate ? 'Copiado!' : 'Copiar Prompt'}
              </button>
            </div>
          </div>

          <div className="p-5">
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl border border-[#E6E8F0] bg-[#F8FAFC] p-4 font-mono text-xs leading-relaxed text-[#334155]">
              {formattedTemplate}
            </pre>
          </div>
        </Card>

        {/* Exemplos Prontos por Segmento */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Exemplo 1: Clínica / Saúde / Estética */}
          <Card>
            <div className="flex items-center justify-between border-b border-[#E6E8F0] p-4 bg-[#F8FAFC]">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-[#10B981]">
                  <Stethoscope className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[#0F172A]">Exemplo: Clínica Odontológica / Estética</h4>
                  <p className="text-[10px] text-[#64748B]">Foco em agendamento de consultas e avaliações</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void copyText(CLINICA_EXAMPLE, setCopiedClinica, 'Exemplo de clínica copiado!')}
                className="inline-flex items-center gap-1 rounded-lg border border-[#E6E8F0] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#475569] hover:bg-slate-50 transition-colors"
              >
                {copiedClinica ? <Check className="h-3.5 w-3.5 text-[#10B981]" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedClinica ? 'Copiado' : 'Copiar'}
              </button>
            </div>
            <div className="p-4">
              <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl border border-[#E6E8F0] bg-[#F8FAFC] p-3.5 font-mono text-[11px] leading-relaxed text-[#334155] max-h-72 overflow-y-auto">
                {CLINICA_EXAMPLE}
              </pre>
            </div>
          </Card>

          {/* Exemplo 2: Tecnologia / B2B / SaaS */}
          <Card>
            <div className="flex items-center justify-between border-b border-[#E6E8F0] p-4 bg-[#F8FAFC]">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-[#6366F1]">
                  <Building2 className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[#0F172A]">Exemplo: Empresa B2B / Serviços / SaaS</h4>
                  <p className="text-[10px] text-[#64748B]">Foco em qualificação e demonstração comercial</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void copyText(SAAS_EXAMPLE, setCopiedSaas, 'Exemplo B2B copiado!')}
                className="inline-flex items-center gap-1 rounded-lg border border-[#E6E8F0] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#475569] hover:bg-slate-50 transition-colors"
              >
                {copiedSaas ? <Check className="h-3.5 w-3.5 text-[#10B981]" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedSaas ? 'Copiado' : 'Copiar'}
              </button>
            </div>
            <div className="p-4">
              <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl border border-[#E6E8F0] bg-[#F8FAFC] p-3.5 font-mono text-[11px] leading-relaxed text-[#334155] max-h-72 overflow-y-auto">
                {SAAS_EXAMPLE}
              </pre>
            </div>
          </Card>
        </div>

        {/* Como Aplicar Passo a Passo */}
        <Card className="p-6">
          <h3 className="text-base font-bold text-[#0F172A] mb-4">Como aplicar no SAVYRON em 3 passos:</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-[#E6E8F0] bg-[#F8FAFC] p-4">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#6366F1] text-white text-xs font-bold mb-2">
                1
              </span>
              <h4 className="text-xs font-bold text-[#0F172A] mb-1">Copie o Prompt</h4>
              <p className="text-[11px] text-[#64748B]">
                Clique no botão <strong>"Copiar Prompt"</strong> acima ou use um dos exemplos de referência.
              </p>
            </div>

            <div className="rounded-xl border border-[#E6E8F0] bg-[#F8FAFC] p-4">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#6366F1] text-white text-xs font-bold mb-2">
                2
              </span>
              <h4 className="text-xs font-bold text-[#0F172A] mb-1">Cole na Configuração</h4>
              <p className="text-[11px] text-[#64748B]">
                Acesse <Link href="/settings/empresa-ia" className="text-[#6366F1] font-semibold underline">Configuração da IA</Link> e cole no campo de descrição (até 15.000 caracteres).
              </p>
            </div>

            <div className="rounded-xl border border-[#E6E8F0] bg-[#F8FAFC] p-4">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#10B981] text-white text-xs font-bold mb-2">
                3
              </span>
              <h4 className="text-xs font-bold text-[#0F172A] mb-1">Clique em "Aplicar na IA"</h4>
              <p className="text-[11px] text-[#64748B]">
                Salve e aplique. A IA do SAVYRON assimilará instantaneamente todas as regras e começará a utilizá-las no WhatsApp.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </DashboardShell>
  );
}
