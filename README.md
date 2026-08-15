# SAVYRON

Plataforma **multi-tenant** de **prospecção comercial automatizada** e atendimento
com IA. Importe ou prospecte leads na web, crie campanhas e deixe que o
WhatsApp, o e-mail e um agente de IA conversem com os clientes — tudo com
limites diários, opt-out obrigatório, planos/assinaturas (Stripe/Cakto) e
auditoria completa.

> **Stack:** Monorepo · Next.js 14 (App Router) · Node.js 20 · TypeScript ·
> Prisma · Neon PostgreSQL · Redis + BullMQ · Baileys (WhatsApp) · Resend
> (e-mail) · Groq + OpenRouter (IA) · Socket.IO · Stripe + Cakto (pagamentos) ·
> Firecrawl (prospecção web) · PM2 · Nginx + Let's Encrypt

## Arquitetura

```
CRM/
├── apps/
│   ├── dashboard/   # Frontend Next.js (porta 3005) — dark/light, mobile-first
│   │                #   Rotas públicas e autenticadas (ver "Navegação" abaixo)
│   ├── api/         # API REST Express (porta 4005) — auth, rotas, filas, Socket.IO
│   └── worker/      # Worker BullMQ (porta 5005) — processa filas + WhatsApp
├── services/        # Lógica compartilhada: ai, email, leads, prospector, whatsapp
│   └── scrapy/      # Serviço Python (Scrapy) de enriquecimento de leads (PM2)
├── packages/        # Pacotes: database (Prisma), config, logger, queues, types, utils
├── scripts/         # build, deploy, ssl, clean-db, gerador de leads/ícones de exemplo
├── tests/           # Testes de unidade (node --test)
├── nginx/           # Config de proxy reverso com SSL
├── logs/            # Logs do PM2 (dashboard/api/worker/scrapy *.out.log e *.err.log)
└── session/         # Sessão persistente do WhatsApp (Baileys) — não versionar
```

### Filas (BullMQ)

| Fila | Função |
|---|---|
| `lead-import` | Parse, validação, deduplicação e gravação de importações |
| `prospecting` | Prospecção web (Firecrawl **ou** Overpass/OSM): descoberta, crawling e criação de leads |
| `lead-enrichment` | Enriquecimento de leads via serviço Scrapy (e-mail, telefone, Instagram/Facebook/WhatsApp) |
| `campaign-processing` | Pump da campanha: respeita limites diários e intervalo |
| `whatsapp-send` | Envio de mensagens WhatsApp (Baileys) |
| `email-send` | Envio de e-mails (Resend) |
| `message-received` | Respostas recebidas (dispara o agente) |
| `ai-response` | Geração de resposta da IA (Groq → OpenRouter) |
| `webhook-processing` | Eventos do Resend (entrega, abertura, clique, bounce…) |
| `retry` | Retry com backoff (máx. 3 tentativas para WhatsApp) |
| `dead-letter` | Falhas permanentes (log estruturado e lead marcado como `ERROR`) |

---

## Navegação do produto

O SAVYRON é dividido em **área pública** (marketing + onboarding),
**painel do cliente** (por empresa) e **painel administrativo**
(plataforma — só `PLATFORM_ADMIN`/`PLATFORM_STAFF`).

```
Área pública          Painel do cliente (autenticado)     Admin (plataforma)
─────────────────     ─────────────────────────────────   ─────────────────────
/vitrine (landing)    /dashboard            /emails        /admin
/login                /prospect            /reports       /admin/businesses
/signup               /campaigns           /settings      /admin/plans
/change-password      /campaigns/[id]      /settings/business   /admin/subscriptions
/payment              /inbox               /ai/settings   /admin/payments
                      /inbox/[id]          /ai/knowledge  /admin/users
                                           /ai/playground /admin/usage
                                           /ai/prompt-guide     /admin/audit
                                                                /admin/settings
```

### Papéis e permissões

- **Na empresa** (`businessRole`): `OWNER` → `BUSINESS_ADMIN` → `MANAGER` → `AGENT`.
  Ações destrutivas (limpar leads importados, limpar conversas, limpar sessão do
  WhatsApp) são restritas a `OWNER`/`BUSINESS_ADMIN` na interface; a autorização
  real é sempre validada na API.
- **Na plataforma** (`platform_role`): `PLATFORM_ADMIN`, `PLATFORM_STAFF`
  (acesso de suporte/leitura) e `NONE`. Apenas quem tem papel de plataforma vê o
  link **Admin** na sidebar e acessa `/admin/*`.

---

## Área pública

| Rota | Conteúdo |
|---|---|
| `/vitrine` | Landing page de marketing: hero, "Como funciona" (4 passos), "Para quem é" (segmentos), "Recursos" (6 cards), "Planos" (cards vindos da API) e CTA final. Botões: **Criar minha conta** → `/signup`, **Ver planos** → `#planos`, **Entrar** → `/login`. |
| `/login` | Login com e-mail/senha (card com efeito 3D). Regras de redirect: `must_change_password` → `/change-password`; `PENDING_PAYMENT` → `/payment`; `SUSPENDED`/`CANCELLED` → erro bloqueante. Link **Cadastre-se** → `/signup`. |
| `/signup` | Onboarding em 3 etapas (stepper): **E-mail** (envio de código de verificação de 6 dígitos, reenviar em 30s, expira em 10min) → **Empresa** (nome, responsável, telefone, segmento, CPF/CNPJ, senha) → **Plano** (cards com features da API, selo "Mais popular" no `enterprise`). Botão final: **Criar conta e seguir para o pagamento** → `/payment`. |
| `/change-password` | Troca de senha obrigatória no 1º acesso (senha atual, nova senha + confirmação; mín. 8 chars com maiúscula, número e símbolo). |
| `/payment` | Página de assinatura pendente: mostra plano/valor, botão **Continuar para pagamento** (Checkout Stripe, ou link Cakto de PIX recorrente quando configurado), **Ativar acesso** para planos gratuitos (R$ 0), botão **Sair**. Redireciona ao `/dashboard` quando pago (polling a cada 5s). |

---

## Painel do cliente

Layout comum (`DashboardShell`): **sidebar** (desktop) com a navegação
principal, depois os grupos *Empresa* (Configurações, Meu negócio), *IA*
(Configurar IA, Base de conhecimento, Testar IA) e o link *Admin*;
**topbar** com título e botão **Sair**;
**bottom-nav** no mobile (Início, Prospecção, Campanhas, Mensagens, E-mails,
Relatórios, Ajustes); banner de "modo suporte" quando o admin está impersonando
a empresa.

### `/dashboard` — Dashboard

Visão geral em tempo real (refetch 15s). Cards e botões:

- Banner **WhatsApp**: `conectado` (verde) / `aguardando QR code` / `desconectado`
  (âmbar) + botão **Gerenciar** → `/settings`.
- **KPIs** (8 cards): *Leads na fila* (âmbar), *Leads importados*, *WhatsApp hoje*
  (hint `limite N`), *E-mails hoje* (hint `limite N`), *Respostas hoje* (azul),
  *Interessados*, *Não interessados*, *Opt-outs*.
- **KPIs secundários** (3 cards): *Campanhas ativas* (azul), *Erros* (vermelho),
  *Mensagens enviadas hoje*.
- Cards de **Limite diário de WhatsApp** e **Limite diário de E-mail** (barra de
  progresso `usado / limite`).
- Card **Campanhas**: lista até 5 campanhas (cada uma linka para
  `/campaigns/[id]`, com badge de teste, status, barra de progresso e total /
  pendentes / respostas / interessados). Botões **Ver todas** → `/campaigns` e,
  quando vazio, **Criar campanha** → `/campaigns`.
- Relógio de **Brasília** no canto superior direito.

### `/prospect` — Prospecção

Hub com **2 abas** (pilulas): **Prospecção web** e **Importação manual**.

**Aba "Prospecção web"** (fila BullMQ em segundo plano; fonte de descoberta
`PROSPECTOR_PROVIDER`: `firecrawl` (paga) ou `overpass`/`auto` — Overpass API
do OpenStreetMap, gratuita, com fallback automático). **Restrita por plano**:
disponível apenas para planos com a feature `prospeccao_web` habilitada
(plano Empresa). A validação é feita no backend (`POST /leads/prospect` retorna
403 sem a feature); na interface o formulário é bloqueado com um aviso e botão
**Fazer upgrade**. A aba **Importação manual** é livre em todos os planos, e o
histórico de prospecções continua visível mesmo após downgrade.

- Card **Nova prospecção**: campos *Segmento/Nicho* (texto livre — aceita
  **qualquer** segmento, não só os exemplos do placeholder), *País*, *Estado (UF)*,
  *Cidade*, *Quantidade de leads* (1–500), select *Adicionar a uma campanha*
  (opcional). Botão **PROSPECTAR** (fica "Já existe uma prospecção em andamento"
  enquanto houver run `PENDING`/`RUNNING`). Valida nicho OU cidade/estado.
- Card **Progresso da prospecção** (aparece com run ativa): barra
  `salvos/alvo`, stats *Encontrados*, *Novos leads*, *Duplicados*, *C/ telefone*
  e botão **Cancelar**. O progresso chega **em tempo real** via Socket.IO
  (evento `prospecting_progress`) além do polling de 5s.
- Card **Resultados**: tabela dos leads encontrados — *Empresa*, *Telefone*
  (link `tel:`), *E-mail* (link `mailto:`), *Cidade*, *Estado*, *Site*,
  *Score* (badge verde/âmbar/cinza) e *Data*.
- Card **Minhas prospecções**: histórico com *Data, Nicho, Localização,
  Solicitados, Encontrados, Novos, Duplicados, Status*; botões **Atualizar**,
  **Cancelar** (runs ativas) e **Ver** (seleciona a run para os resultados).

**Aba "Importação manual"** (`.csv`/`.xlsx` ou colar texto):

- Card **Importação manual**: botão **Modelo** (baixa `modelo-leads.csv`),
  alternância **Arquivo** / **Colar texto**, dropzone (máx. 5MB,
  `.csv/.xlsx/.xls`), checkbox **Modo teste** (importa apenas
  `TEST_MODE_MAX_LEADS`), select *Importar para campanha* e botão
  **Calcular prévia**.
- Card **Prévia**: contadores *Total / Válidos-novos / Duplicados / Inválidos*,
  tabela com status por linha (Novo / Duplicado / Inválido + motivo), botões
  **Cancelar** e **Confirmar importação (N leads)**.
- Card **Limpar leads importados** (só `OWNER`/`BUSINESS_ADMIN`): mostra
  quantidade de leads importados e na fila; botão **Limpar leads importados**
  (destrutivo, exige digitar `EXCLUIR`).

### `/campaigns` — Campanhas

- Botão **Nova campanha** → modal: *Nome*, *Limite WhatsApp/dia*,
  *Limite E-mail/dia*, *Intervalo entre envios (s)*, *Início diário
  (horário de Brasília)* e checkbox *Campanha de teste*. Botões **Cancelar** /
  **Criar**.
- **Card por campanha** (clica para abrir `/campaigns/[id]`): nome, badge
  `teste`, badge de status (Ativa/Pausada/Encerrada), resumo de limites e
  intervalo, barra de progresso, countdown do próximo envio e stats
  *total / fila / respostas / interes. / erros*. Ações por status:
  - `PAUSED` → **Iniciar**
  - `ACTIVE` → **Pausar** · **Encerrar**
  - `FINISHED` → **Reabrir**
  - Sempre → **Excluir** (modal de confirmação; os leads importados não são
    apagados, apenas o vínculo).
- Estado vazio → card com botão **Criar primeira campanha**.

### `/campaigns/[id]` — Detalhe da campanha

- Link **Voltar** → `/campaigns` e ações de status (Iniciar / Pausar agora /
  Encerrar / Reabrir) + **Excluir**.
- Badges de status + limites + countdown do próximo envio.
- **6 stat cards**: *Total, Pendentes, Enviados, Respostas, Interessados, Erros*.
- Card **Progresso** (processados vs fila).
- Card **Ajustar limites**: inputs *Limite WhatsApp/dia*, *Limite E-mail/dia*,
  *Intervalo (s)* e *Início diário (Brasília)* + botão **Salvar**.
- Card **Leads da campanha**: tabela *Nome, Empresa, Contato, Canal, Status,
  Tentativas* (badges de status do lead).

### `/inbox` — Mensagens (inbox)

- **Filtros** (pílulas): `Enviado`, `Respondido`, `Manual`, `Encerradas`.
- Contador de conversas + botão **Limpar tudo** (só
  `OWNER`/`BUSINESS_ADMIN`; exige digitar `EXCLUIR`).
- **Grid de cards** de conversa (`InboxCard`): nome do lead, empresa, prévia e
  hora da última mensagem, badges *IA (provedor)* ou *Manual*, status do lead e
  destaque de nova mensagem (tempo real via Socket.IO). Clique abre
  `/inbox/[id]`; botão de **excluir** individual (confirmação).

### `/inbox/[id]` — Conversa (chat)

- Header: voltar, avatar, nome do lead, badge **Manual** ou **IA (provedor)**,
  badge Aberta/Encerrada e dados do lead (empresa · telefone/e-mail · cidade).
- Ações: **Assumir** (modo manual) / **IA** (devolver à IA) / **Encerrar**.
- Bubbles de mensagens + indicador de "digitando…" enquanto a IA processa.
- Composer: textarea auto-grow (só editável no modo manual), Enter envia,
  botão de **enviar**. Nota contextual: *"A IA está de prontidão. Assuma a
  conversa para responder manualmente."*

### `/emails` — E-mails enviados

- Card de **filtros**: select *Status* (Todos/Enviados/Falhas/Devolvidos),
  datas *De/Até* e botão **Atualizar** (refetch 20s).
- Tabela: *Destinatário, Assunto, Data/hora, Status* (badge Enviado/Falhou/
  Devolvido; erros anexados ao assunto).

### `/reports` — Relatórios

- Card **Período**: datas *De/Até* + **Atualizar** (`?from=YYYY-MM-DD&to=...`).
- **Taxas** (4 cards): *Taxa de resposta*, *Taxa de interesse*, *Taxa de
  conversão* (verde), *Taxa de opt-out* (vermelho).
- **Totais** (4 cards): *Enviadas, Respostas, Interessados, Opt-outs*.
- Gráfico de barras **Envios por dia** e linha **Interessados acumulados**
  (recharts).
- Card de nota: taxas usam dados reais do período.

### `/settings` — Configurações

- Card **WhatsApp (Baileys)**: badge de status (Conectado/Aguardando QR/
  Desconectado), QR code para escanear, botões **Conectar WhatsApp** /
  **Desconectar** e, para `OWNER`/`BUSINESS_ADMIN`, **Limpar sessão**
  (destrutivo, exige `EXCLUIR`). Sessão persistida em `WHATSAPP_SESSION_PATH`.
- Card **Limites e intervalo**: *Limite WhatsApp/dia*, *Limite E-mail/dia*,
  *Intervalo entre envios (s)* — valores padrão para novas campanhas — + botão
  **Salvar**.
- Card **Parada de emergência**: botão vermelho **Pausar todas as campanhas**
  (`POST /campaigns/pause-all`).

### `/settings/business` — Meu negócio

Dados usados pela IA para personalizar o atendimento:

- Card **Identificação**: *Nome da empresa*, *Segmento* (select), *Telefone*,
  *E-mail*, *CNPJ*, *Descrição*.
- Card **Presença e localização**: *Endereço*, *Site*, *Instagram*, *Horário de
  funcionamento*, *Fuso horário* (select, fusos do Brasil), *Logo (URL)*.
- Card **Informações adicionais**: textarea livre.
- Botão **Salvar alterações** (PATCH `/business/settings`).

### `/ai/settings` — Configurar IA

- Card **Identidade do agente**: *Nome*, *Função*, *Descrição*.
- Card **Tom de voz**: chips selecionáveis (Profissional, Amigável, Casual,
  Descontraído, Premium, Consultivo, Técnico).
- Card **Comportamento**: 9 checkboxes (ser natural, evitar robótico, fazer
  perguntas, identificar necessidade, tentar converter, oferecer
  produtos/serviços, tentar agendar, encaminhar para humano, usar emojis).
- Card **Mensagens**: *Tamanho máximo (caracteres)*, *Máximo de frases*,
  *Mensagens por resposta*, *Máximo de emojis*.
- Card **Prompt personalizado**: textarea (limite 20.000 chars, contador) +
  link **Guia de prompts** → `/ai/prompt-guide`. Regras de segurança da
  plataforma não podem ser sobrescritas.
- Botões **Recarregar** e **Salvar configuração** (cria/atualiza o agente e
  vincula às configurações).

### `/ai/knowledge` — Base de conhecimento

- Card de criação/edição: botão **Nova informação** (ou form aberto com
  *Título*, *Categoria* — Produtos, Serviços, Preços, Horários, Políticas, FAQ,
  Endereço, Formas de pagamento, Regras internas — e *Conteúdo*). Botões
  **Adicionar** / **Salvar alterações** / **Cancelar**.
- Lista de itens: título, badge de categoria, badge `inativo` e ações
  **Ativar/Desativar**, **editar** e **excluir**.

### `/ai/playground` — Testar IA

- Aviso âmbar se nenhum provedor estiver configurado.
- Card **Envie uma mensagem de teste** + botão **Gerar resposta** (não envia
  nada para WhatsApp/e-mail reais).
- Card **Resposta da IA**: mensagem enviada, resposta gerada, nome do agente e
  aviso de que é apenas um teste.

### `/ai/prompt-guide` — Guia de prompts

Guia para gerar o prompt do agente com o ChatGPT: *O que você vai aprender*,
*Antes de começar*, *Como fazer* (8 passos), **Prompt pronto para gerar seu
agente** (template + botão **Copiar prompt**), *Exemplo preenchido*, *Como
melhorar o prompt depois*, *Checklist antes de publicar* e *Regra de ouro*.
Link **Voltar para Configurar IA**.

---

## Painel administrativo (`/admin`)

Acesso restrito a `PLATFORM_ADMIN`/`PLATFORM_STAFF`. Sidebar própria com
navegação e link **Voltar ao painel**. Suporta **impersonation** (modo suporte):
o admin entra como uma empresa sem saber a senha (auditado) e um banner âmbar
oferece **Sair do modo de suporte** → `/admin/impersonate/exit`.

| Rota | Conteúdo / cards / botões |
|---|---|
| `/admin` | **Dashboard da plataforma**: cards *MRR* (+ nº de assinaturas), *ARR*, *Receita do mês*, *Receita total*, *Empresas* (ativas), *Ativos*, *Trial*, *Canceladas* (com % churn), *Assinaturas vencidas*, *Pagamentos pendentes*; bloco **Uso da IA** (*Contatos, Conversas, Mensagens, Gerações*). |
| `/admin/businesses` | Lista de empresas (tenants): busca por nome/slug/e-mail + botão **Buscar**; card por empresa com status (PENDING_PAYMENT, TRIAL, ACTIVE, PAST_DUE, SUSPENDED, CANCELLED) e contadores (contatos/conversas/mensagens/usuários). Botões **Suspender**, **Reativar**, **Cancelar** e **Suporte** (impersonação com *motivo* + **Entrar**). |
| `/admin/plans` | Cards de plano (preço `/mês` ou `/ano`, features com limite/∞, badge ativo/inativo) + **Editar**; botão **Novo plano** com form completo (nome, slug, preço, trial, descrição, intervalo, Stripe `product`/`price`, features dinâmicas). Alterações valem para novos cadastros. |
| `/admin/subscriptions` | Lista de assinaturas (empresa, plano, valor, período, nº de pagamentos, Stripe id). Modal de detalhe: troca de plano (**Mudar para o plano** + **Aplicar**), **Cancelar** / **Reativar** e histórico de pagamentos. |
| `/admin/payments` | Filtros (status, empresa, período) + **Filtrar**/**Limpar**; card por pagamento (método, valor, status, gateway) com botão **Reconciliar** (sincroniza com o gateway). |
| `/admin/users` | Botão **Novo usuário** (nome, e-mail, senha, admin da plataforma); lista de usuários com badge de papel e status. Modal de edição: *Papel na plataforma* (NONE/PLATFORM_STAFF/PLATFORM_ADMIN), *Status da conta* e *Empresas do usuário* (memberships). |
| `/admin/usage` | Filtros (empresa, período) + **Aplicar**; cards de totais (*Mensagens enviadas/recebidas, Conversas, Gerações de IA, Tokens, Contatos, Opt-outs*) e tabela de consumo por empresa. |
| `/admin/audit` | Trilha de auditoria: filtro por *ação*, **Atualizar**, deduplicação por id e paginação **Carregar mais** (50 por página). |
| `/admin/settings` | Configurações globais (pares chave/valor): form *Chave/Valor* + **Salvar**, e por item **Editar**/**Remover**. |

---

## API (rotas principais)

Todas as rotas abaixo são montadas na API Express (porta 4005) e prefixadas
por `API_BASE_URL`. O dashboard chama a API através do proxy local
`/api/proxy/[...path]` com o token da sessão — o navegador nunca expõe o
`API_TOKEN`.

| Área | Prefixo | Endpoints |
|---|---|---|
| Saúde | `/health` | `GET /` |
| Auth | `/auth` | `POST /login` · `POST /logout` · `POST /change-password` · `GET /me` · `GET /businesses` · `POST /select-business` |
| Onboarding | `/auth` | `GET /plans` · `POST /send-code` · `POST /verify-code` · `POST /signup` |
| Prospecção web | `/leads` | `POST /leads/prospect` · `GET /leads/prospections` · `GET /leads/prospections/:id` · `GET /leads/prospections/:id/leads` · `POST /leads/prospections/:id/cancel` |
| Importação | `/leads` | `POST /leads/import/preview` · `POST /leads/import/confirm` · `GET /leads/imports` · `GET /leads/imported/count` · `DELETE /leads/imported` · `GET /leads` · `GET /leads/:id` |
| Campanhas | `/campaigns` | `POST /` · `GET /` · `POST /pause-all` · `GET /:id` · `PATCH /:id` · `GET /:id/leads` · `GET /:id/stats` · `POST /:id/start` · `POST /:id/pause` · `POST /:id/resume` · `POST /:id/finish` · `DELETE /:id` |
| Dashboard | `/dashboard` | `GET /metrics` · `GET /settings` · `PUT /settings` |
| Inbox | `/conversations` | `GET /` (filtro) · `GET /:id` · `POST /:id/takeover` · `POST /:id/release` · `POST /:id/message` · `POST /:id/close` · `DELETE /` (limpar tudo) · `DELETE /:id` |
| Relatórios | `/reports` | `GET /?from&to` |
| WhatsApp | `/whatsapp` | `GET /status` · `GET /qr` · `POST /connect` · `POST /disconnect` · `POST /clear-session` |
| E-mails | `/emails` | `GET /?status&from&to` |
| Empresa | `/business` | `GET /settings` · `PATCH /settings` |
| IA | `/ai` | `GET/POST /agents` · `PATCH/DELETE /agents/:id` · `GET/PATCH /settings` · `GET/POST /knowledge` · `PATCH/DELETE /knowledge/:id` · `GET /playground/status` · `POST /playground` |
| Billing | `/billing` | `GET /status` · `POST /checkout` · `POST /activate-free` |
| Admin | `/admin` | `GET /dashboard` · `GET/POST /businesses` · `GET/PATCH /businesses/:id` · `POST /businesses/:id/status` · `GET/POST /plans` · `PATCH /plans/:id` · `GET /subscriptions` · `GET /subscriptions/:id` · `POST /subscriptions/:id/change-plan` · `POST /subscriptions/:id/cancel` · `POST /subscriptions/:id/reactivate` · `GET /payments` · `POST /payments/:id/reconcile` · `GET /usage` · `GET /audit` · `GET/POST /users` · `GET/PATCH /users/:id` · `GET /support-sessions` · `POST /impersonate` · `POST /impersonate/exit` · `GET/PATCH /settings` · `DELETE /settings/:key` |
| Webhooks | `/webhooks` | `POST /stripe` · `POST /cakto` · `POST /resend` · `POST /whatsapp` |

---

## Fluxo de uma campanha

1. **Prospectar** (`/prospect`): use a aba **Prospecção web** (Firecrawl, em
   segundo plano via fila) ou a **Importação manual** (upload `.csv`/`.xlsx` ou
   colar texto). O importador identifica colunas automaticamente, normaliza
   (telefone → E.164), valida e deduplica — prioridade:
   **telefone > e-mail > id externo > nome+telefone**. A prévia mostra
   total / válidos / duplicados / inválidos / novos.
2. **Confirmar** → enfileira `lead-import` (worker grava em lote, rápido).
3. **Criar campanha** (`/campaigns`) com limites diários, intervalo entre
   envios e opcionalmente uma **hora de início** (janela diária de envio no fuso
   de Brasília — antes dela, o pump aguarda). Em modo de teste
   (`is_test`), importa e envia no máximo `TEST_MODE_MAX_LEADS` leads.
4. **Iniciar** → o pump respeita os limites (padrão: 30 WhatsApp/dia,
   100 e-mails/dia) e despacha **no máximo 1 mensagem por ciclo**, espaçadas
   pelo `interval_seconds` da campanha (padrão: 7.200s). Pode ser
   **pausado/encerrado a qualquer momento** (ou "pausar todas" em `/settings`).
5. Primeira mensagem curta: *"Oi, tudo bem? Falo com o responsável pelo [estabelecimento]?"*
6. Se o lead **responder**, o agente de IA entra (Groq, com fallback OpenRouter):
   identifica o responsável, apresenta o negócio, tira dúvidas (usando a base de
   conhecimento) e, havendo interesse, conduz à conversão. O resultado é
   classificado (INTERESSADO / NÃO INTERESSADO / PERGUNTA / OCUPADO…).
7. **Opt-out é obrigatório**: "não quero", "pare", "me tira da lista" etc.
   registram `OptOut` e o lead nunca mais é contatado.
8. **Inbox** (`/inbox`): o operador vê as conversas, pode **assumir** (modo
   manual) e **devolver para a IA**. Histórico completo fica auditável. Novas
   respostas chegam em tempo real (Socket.IO).
9. **Relatórios** (`/reports`): taxa de resposta, interesse, conversão e
   opt-out, com séries por dia e filtro por período.

## Configuração da IA

`services/ai/src/provider-manager.ts` implementa o `AIProviderManager`:
tenta **Groq** primeiro e, em falha (timeout, HTTP 5xx, rate limit,
indisponibilidade), faz fallback para **OpenRouter**. Os modelos e prompts ficam
em `services/ai/src/prompts.ts` (versão `v1` registrada na tabela `AIGeneration`).
A classificação de intenção (`services/ai/src/classifier.ts`) usa IA e, quando
indisponível ou em falha, cai para heurística por palavras-chave — **opt-out**
sempre é detectado até sem IA.

Cada empresa tem um **agente** configurável (identidade, tom, comportamentos,
limites de mensagem e prompt personalizado) e uma **base de conhecimento**
categorizada (produtos, preços, horários, políticas…) usada como contexto nas
respostas. O **playground** permite testar o agente sem enviar mensagens reais.

## Fontes de dados da prospecção e enriquecimento

O campo **Segmento / Nicho** é texto livre — funciona para **qualquer**
segmento digitado ("loja de roupas", "escritório de advocacia", "academia de
crossfit", "distribuidora de bebidas"…), não só os exemplos do placeholder.

- **Firecrawl** (paga, chave `FIRECRAWL_API_KEY`): o texto do Segmento/Nicho é
  passado **diretamente** para a busca (sem lista fechada nem condicionais por
  segmento) e crawleia os sites para extrair contatos. Erros HTTP/rate-limit/
  timeout propagam para a run virar `FAILED` (nunca "sucesso disfarçado").
- **Overpass API / OpenStreetMap** (gratuita, sem chave): alternativa por
  categoria + localização. O segmento é mapeado para tags OSM por um
  **mapeamento amplo** (dezenas de categorias: `shop=*`, `amenity=*`,
  `office=*`, `craft=*`, `healthcare=*`…) com **correspondência fuzzy**
  (ignora acentos/caixa/plurais e corrige erros de digitação comuns). A
  região vira bounding box via Nominatim.
  - **Não existe "nicho não suportado"**: segmentos sem tag direta caem em
    **busca por nome** (`name~"termo"`), sempre tentando a busca de verdade.
    O uso do fallback é logado (`Segmento sem tag OSM mapeada — usando busca
    por nome`) para a equipe ampliar o mapeamento com termos reais.
  - Localização não resolvida → `FAILED` com motivo claro; segmento que não
    retorna resultados → a run termina honestamente como `PARTIAL` (nenhum
    resultado encontrado), nunca "sucesso vazio disfarçado".
- **Seleção** (`PROSPECTOR_PROVIDER`): `firecrawl` força Firecrawl;
  `overpass` força Overpass; `auto` (padrão) usa Firecrawl quando a chave
  existe e cai para Overpass caso contrário — reduzindo o ponto de falha único.
- **Enriquecimento (Scrapy)**: após salvar leads com site, a fila
  `lead-enrichment` despacha para o serviço Python `prospector-scrapy`
  (`services/scrapy`), que visita o site institucional e extrai e-mail,
  telefone, Instagram, Facebook e WhatsApp (respeitando `robots.txt`, com
  User-Agent identificável, delay educado e timeout curto). Falhas de um site
  nunca derrubam o job. Logs em `logs/scrapy.{out,err}.log`.
- **Deduplicação e normalização**: reutilizam a lógica existente
  (prioridade telefone > e-mail > id externo > nome+telefone) e os normalizadores
  testados de telefone/e-mail — nada é duplicado.

## Billing (planos, assinaturas e pagamentos)

- **Planos** (`Plan`/`PlanFeature`) são gerenciados em `/admin/plans` e expostos
  publicamente em `/vitrine` e `/signup` (apenas planos ativos).
- **Assinatura** (`Subscription`) é criada no signup com status
  `PENDING_PAYMENT`; a empresa só vira `ACTIVE` após o pagamento.
- **Gateways**: o checkout usa o **Cakto** (PIX recorrente, link pré-preenchido)
  quando configurado; caso contrário, cai para o **Checkout Stripe** (PIX +
  cartão via `STRIPE_PAYMENT_METHOD_CONFIGURATION_ID`). Planos gratuitos
  (R$ 0) usam `POST /billing/activate-free`.
- **Webhooks** (`/webhooks/stripe`, `/webhooks/cakto`) atualizam pagamento,
  assinatura e status da empresa; eventos de auditoria são gravados.

## Início rápido (desenvolvimento)

```bash
# 1. Ambiente
cp .env.example .env           # preencha as chaves (Neon, Redis, Groq, Resend…)
docker compose up -d           # Redis local (opcional; já existe um rodando na VPS)

# 2. Dependências + Prisma
npm install
npm run db:generate
npm run db:migrate             # aplica migrações
npm run db:seed                # cria admin e configurações padrão

# 3. Build dos pacotes e serviços
npm run build:packages

# 4. Rodar os 3 serviços (em terminais separados)
npm run dev:api
npm run dev:worker
npm run dev:dashboard
```

Acesso padrão (primeiro acesso **obriga troca de senha**):

```
E-mail: ceo.inovapro@maicon
Senha:  Inovapro$2026
```

## Configuração (variáveis de ambiente)

Copie `.env.example` para `.env`. O pacote `@prospector/config`
(`packages/config/src/index.ts`) lê tudo a partir da raiz do monorepo.
Variáveis **obrigatórias**: `DATABASE_URL`, `SESSION_SECRET` e `API_TOKEN`.

| Grupo | Variáveis principais | Obrigatória | Observações |
|---|---|---|---|
| Banco | `DATABASE_URL` (Neon PostgreSQL) | sim | `sslmode=require` |
| Redis | `REDIS_URL` | — | padrão `redis://localhost:6379` |
| IA | `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `GROQ_MODEL`, `OPENROUTER_MODEL`, `AI_TIMEOUT_MS`, `AI_MAX_MESSAGE_LENGTH` | — | Groq primeiro, OpenRouter como fallback |
| E-mail | `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `EMAIL_FROM_NAME` | — | — |
| Pagamentos | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PAYMENT_METHOD_CONFIGURATION_ID` | — | Checkout Stripe (PIX + cartão) |
| Pagamentos (Cakto) | `CAKTO_CLIENT_ID`, `CAKTO_CLIENT_SECRET`, `CAKTO_WEBHOOK_SECRET`, `CAKTO_API_BASE_URL` | — | PIX recorrente; preferido quando configurado |
| Prospecção web | `PROSPECTOR_PROVIDER` (`firecrawl`/`overpass`/`auto`), `FIRECRAWL_API_KEY`, `FIRECRAWL_API_BASE_URL`, `PROSPECTOR_*` (delays, limites, rate limits) | — | `auto` (padrão): Firecrawl se a chave existir; senão, Overpass. Com `firecrawl` sem chave, a prospecção falha com erro claro (sem fallback fabricado). |
| Overpass/OSM | `OVERPASS_API_URL`, `OVERPASS_TIMEOUT_MS`, `OVERPASS_RETRY_ATTEMPTS`, `NOMINATIM_API_URL` | — | Fonte gratuita de descoberta (OpenStreetMap), sem chave; geocoding via Nominatim |
| Enriquecimento (Scrapy) | `SCRAPY_SERVICE_URL`, `SCRAPY_CONCURRENCY`, `SCRAPY_REQUEST_DELAY_MS`, `SCRAPY_SERVICE_PORT` (no serviço Python) | — | Serviço `prospector-scrapy` (PM2); enriquece leads com e-mail/telefone/redes |
| WhatsApp | `WHATSAPP_SESSION_PATH` | — | pasta da sessão do Baileys no servidor |
| App | `SESSION_SECRET`, `API_TOKEN`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `NEXT_PUBLIC_APP_URL`, `API_BASE_URL`, `DASHBOARD_URL` | `SESSION_SECRET` + `API_TOKEN` | `ADMIN_*` usados pelo seed |
| Campanha | `DEFAULT_WHATSAPP_DAILY_LIMIT` (30), `DEFAULT_EMAIL_DAILY_LIMIT` (100), `DEFAULT_INTERVAL_SECONDS` (7200), `TEST_MODE_MAX_LEADS` (5) | — | defaults em segundos |
| Tempo real | `NEXT_PUBLIC_SOCKET_URL` | — | vazio em produção (proxy no nginx); `http://localhost:4005` em dev |
| Portas | `DASHBOARD_PORT` (3005), `API_PORT` (4005), `WORKER_PORT` (5005) | — | — |
| Segurança | `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX` | — | rate limit global por IP |

## Deploy (produção)

```bash
bash scripts/deploy.sh          # instala, migra, seed, build e sobe via PM2
pm2 save                        # salva a lista de processos
pm2 startup                     # habilita o auto-start no boot
```

Arquivos importantes:

- `ecosystem.config.js` — quatro processos: `prospector-dashboard`, `prospector-api`, `prospector-worker` e `prospector-scrapy` (enriquecimento Python/Scrapy), cada um com `max_memory_restart: 512M` e logs em `logs/`.
- `nginx/crm.inovapro.cloud.conf` — proxy reverso + SSL (copiar para `/etc/nginx/sites-available/`).
- `scripts/setup-ssl.sh` — emite/renova o certificado Let's Encrypt.

O domínio `crm.inovapro.cloud` → dashboard (3005). `/api/*` passa pelo
dashboard (que faz o proxy de dados para a API 4005 com o token da sessão).
`/api/webhooks/*` e `/socket.io/*` vão direto para a API (webhooks do Resend/
Stripe/Cakto e tempo real via Socket.IO).

## Operação e manutenção

### Processos e logs (PM2)

```bash
pm2 status                  # estado dos 3 processos
pm2 logs prospector-api     # acompanhar logs em tempo real
pm2 logs --lines 500        # últimas 500 linhas dos 3 processos
pm2 restart prospector-worker   # reiniciar um serviço específico
```

Logs estruturados também gravam em disco:

| Processo | stdout | stderr |
|---|---|---|
| dashboard | `logs/dashboard.out.log` | `logs/dashboard.err.log` |
| api | `logs/api.out.log` | `logs/api.err.log` |
| worker | `logs/worker.out.log` | `logs/worker.err.log` |
| scrapy | `logs/scrapy.out.log` | `logs/scrapy.err.log` |

Cada entrada inclui timestamp, level, service e IDs de contexto
(`lead_id`, `campaign_id`, `message_id`…), o que facilita rastrear um lead
específico.

### Verificação de saúde

```bash
curl http://localhost:4005/health
# → { success: true, service: 'api', version, env, uptime,
#     dependencies: { database: 'ok', redis: 'checked-at-runtime' } }
```

O endpoint retorna **503** (e `success: false`) se o banco não responder.
O Checks do PM2/Nginx conseguem usar isso como healthcheck.

### Scripts utilitários

| Script | Função |
|---|---|
| `npm run build` | Build completo (pacotes + API + worker + dashboard) — `scripts/build-all.sh` |
| `npm run typecheck` | TypeScript em todo o monorepo — `scripts/typecheck.sh` |
| `npm run lint` | ESLint — `scripts/lint.sh` |
| `npm test` | Testes de unidade — `scripts/test.sh` |
| `node scripts/clean-db.mjs` | **Zera todos os dados** (leads, campanhas, conversas, mensagens, opt-outs, eventos, gerações IA) e **limpa as filas do Redis**. Preserva `User` (login), `Setting` (configurações) e a sessão do WhatsApp em disco. |
| `node scripts/generate-sample-leads.js 1000 data/sample-leads.csv` | Gera 1.000 leads fictícios (com duplicados e inválidos) para validar a importação |
| `node scripts/generate-pwa-icons.mjs` | Regenera os ícones PWA em `public/icons/` |
| `bash scripts/setup-ssl.sh` | Emite/renova o certificado Let's Encrypt |

> ⚠️ `clean-db.mjs` é **destrutivo** (apaga campanhas e mensagens). Use apenas
> para resetar o ambiente de desenvolvimento.

### Troublehooting

- **WhatsApp desconectado / sem QR**: acesse `/settings` → "Conectar WhatsApp"
  e escaneie o QR no celular (WhatsApp → Aparelhos conectados). A sessão fica
  em `WHATSAPP_SESSION_PATH`. Se o QR não aparecer, o worker pode estar parado
  (`pm2 logs prospector-worker`) ou o WhatsApp exigir nova validação.
- **Mensagens enfileiradas mas não saem**: verifique se o Redis está de pé e o
  worker processando (`pm2 status`, `pm2 logs prospector-worker`).
- **Campanha contatou o limite diário**: o pump pausa sozinho até a próxima
  janela (no dia seguinte, no mesmo horário de Brasília).
- **Campanha não envia mesmo ativa**: se houver `start_hour` configurado, os
  envios só acontecem dentro da janela diária de Brasília. Antes da hora de
  início o pump aguarda (o painel mostra o countdown).
- **Lead sempre em `ERROR`**: o envio caiu na fila `dead-letter` após 3
  tentativas (ex.: número inválido, WhatsApp rejeitou). O motivo fica no log
  estruturado e na auditoria da mensagem.
- **Prospecção web falha**: confira `PROSPECTOR_PROVIDER`. Com `firecrawl`,
  confirme `FIRECRAWL_API_KEY` (a API retorna
  *"Prospecção indisponível: mecanismo de descoberta não configurado."* se o modo
  for firecrawl sem chave). Com `overpass`/`auto`, erros de mapeamento de
  segmento ou de geocoding são registrados como `FAILED` com motivo no summary
  (nunca "sucesso disfarçado").
- **Run termina "Concluída parcialmente" com zeros**: a fonte de descoberta
  falhou e o erro não foi propagado (regressão antiga). Erros da Firecrawl/Overpass
  agora propagam para a run virar `FAILED` com o motivo. Verifique `pm2 logs
  prospector-worker`.
- **Enriquecimento não roda**: confirme que o processo `prospector-scrapy` está
  de pé (`pm2 status`) e `SCRAPY_SERVICE_URL`. Falhas de um site são toleradas
  (o lead segue salvo).
- **Empresa travada em PENDING_PAYMENT**: verifique o pagamento em
  `/admin/payments` (botão **Reconciliar**) e o webhook do gateway.
- **Reset de dados**: `node scripts/clean-db.mjs`.

## Tempo real (WebSocket) e PWA

### Arquitetura do tempo real

```
dashboard (browser) ──Socket.IO──► nginx /socket.io/ ──► API (4005)
                                      ▲                          │
           worker ──Redis pub/sub─────┴───────────► Socket.IO ──┘
```

- O **worker** publica eventos no Redis (canal `realtime:events`) ao processar
  mensagens recebidas (`new_message_received`), respostas da IA
  (`ai_response_generated`), mudanças de status (`status_changed`) e progresso
  de prospecção (`prospecting_progress`, usado na aba `/prospect`).
- A **API** assina o canal e retransmite para os navegadores via **Socket.IO**
  (o mesmo servidor HTTP da API). A autenticação valida o JWT da sessão
  (`acp_token`) no handshake.
- O **dashboard** mantém **uma única conexão** (singleton, `lib/socket-client.ts`)
  — navegar entre rotas não abre conexões duplicadas. Com reconexão automática
  e um banner de "modo offline" quando cai.

### Configuração do WebSocket

| Variável | Obrigatória | Descrição |
|---|---|---|
| `NEXT_PUBLIC_SOCKET_URL` | não | Em produção deixe **vazio** (o browser usa o mesmo origin e o nginx faz proxy `/socket.io/` → API 4005). Em **dev local**, defina `http://localhost:4005`. |

No nginx, o bloco `location /socket.io/` já encaminha para a API com headers de
upgrade de WebSocket (ver `nginx/crm.inovapro.cloud.conf`). Após editar:

```bash
cp nginx/crm.inovapro.cloud.conf /etc/nginx/sites-available/crm.inovapro.cloud
nginx -t && nginx -s reload
```

### PWA (instalável e offline)

- `app/manifest.ts` gera `manifest.webmanifest` (tema dark `#0f0f0f`, ícones
  `any` + `maskable`, `display: standalone`).
- `public/sw.js` é o Service Worker (cache dos assets estáticos, network-first
  para navegação e para `/api/proxy/*` — o inbox funciona offline com o último
  estado carregado).
- `public/icons/*.png` são os ícones (192/512/maskable/apple-touch). Para
  regenerá-los: `node scripts/generate-pwa-icons.mjs`.
- O registro acontece em produção automaticamente
  (`components/pwa/service-worker-register.tsx`).
- **iOS/Safari:** "Adicionar à Tela de Início" usa `apple-touch-icon-180.png`
  e `appleWebApp` metadata (sem service worker em contextos não seguros).

## Segurança

- Sessão por JWT (HS256) em cookie `httpOnly` + `Secure`; troca de senha obrigatória no 1º acesso.
- Auth com verificação de e-mail (código de 6 dígitos, uso único) no signup.
- Papéis na empresa e na plataforma; ações destrutivas restritas a
  `OWNER`/`BUSINESS_ADMIN` e telas de admin a `PLATFORM_ADMIN`/`PLATFORM_STAFF`
  (validação sempre no backend).
- Todas as rotas do dashboard protegidas por middleware.
- Rate limiting por IP na API (exceto webhooks); uploads limitados a 5MB e
  sanitizados por extensão (`.csv`, `.xlsx`, `.xls`).
- Chamadas do dashboard para a API passam por um proxy local com
  `API_TOKEN` — o navegador nunca expõe o token da API.
- Impersonation (modo suporte) auditada — cada sessão de suporte fica registrada.
- Sessão do WhatsApp persistida apenas no servidor (`WHATSAPP_SESSION_PATH`), nunca no código.
- Logs estruturados (timestamp, level, service, lead_id, campaign_id…) e trilha
  de auditoria de ações administrativas e de billing.

## Testes

```bash
npm test
```

Cobre normalização de telefone/e-mail, parser CSV, deduplicação (incluindo contra
base existente), modo teste e detecção de opt-out.

## Dados de exemplo

```bash
node scripts/generate-sample-leads.js 1000 data/sample-leads.csv
```

Gera 1.000 leads fictícios com duplicados e inválidos para validar a importação.

---

> **Prospecção responsável:** o sistema respeita limites diários e de plataforma.
> Não burla CAPTCHA nem limites do WhatsApp/Resend.
