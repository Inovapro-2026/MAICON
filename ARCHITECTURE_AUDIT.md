# ARCHITECTURE_AUDIT — AgendaCorte Prospector → SAVYRON

> **FASE 1 — Auditoria.** Este documento não altera código. Serve de base para as
> fases seguintes (multi-tenant, admin, IA, generalização, prospecção, billing).
> Data do diagnóstico: a partir do estado atual do repositório `CRM`.

---

## 1. Resumo executivo

O projeto atual é um **produto single-tenant** de prospecção comercial do
AgendaCorte: importa leads, dispara campanhas via WhatsApp/e-mail, um agente de
IA conversa e classifica, com limites diários, opt-out e auditoria.

A base técnica é **sólida e reutilizável na maior parte**: monorepo limpo,
separação API/worker/frontend, filas BullMQ, providers de IA com fallback,
camadas de leads (parse/normalização/validação/dedup), session persistente do
Baileys, Socket.IO realtime, PM2 + Nginx. **Nada disso deve ser recriado.**

A transformação para **SAVYRON multi-tenant** exige, antes de tudo, resolver
quatro pilares que hoje **não existem**:

1. **Modelo de empresa/tenant** (nenhuma tabela tem `businessId`).
2. **RBAC** (só existe `role = ADMIN` global; não há membership).
3. **Isolamento de dados** (todas as queries são globais; basta trocar um `id`
   na URL para ler dados que não são seus — risco de IDOR).
4. **Prompts/branding** de barbearia/AgendaCorte hardcoded na IA, e-mails, logo
   e textos.

O restante (leads, importação, campanhas, filas, inbox, IA, tempo real) é
**generalizável e deve ser preservado**, adaptando cada entidade ao tenant.

---

## 2. Estado atual

### 2.1 Estrutura do repositório

```
CRM/                                # monorepo (npm workspaces)
├── apps/
│   ├── dashboard/                 # Next.js 14 (App Router) — porta 3005
│   ├── api/                       # Express — porta 4005 (auth, rotas, Socket.IO)
│   └── worker/                    # BullMQ Worker — porta 5005 (+ WhatsApp runtime)
├── services/
│   ├── ai/                        # provider-manager, agent, classifier, prompts
│   ├── email/                     # Resend: templates + webhook
│   ├── leads/                     # importer, normalizer, validator, deduplicator
│   └── whatsapp/                  # Baileys: manager, sender, receiver, session
├── packages/
│   ├── database/                  # Prisma (schema, seed, migrations)
│   ├── config/                    # centraliza env (obrigatórias: DATABASE_URL, SESSION_SECRET, API_TOKEN)
│   ├── logger/                    # pino estruturado
│   ├── queues/                    # nomes/lista das filas BullMQ
│   ├── types/                     # tipos compartilhados
│   └── utils/                     # csv, phones, emails, brasilia, crypto, async
├── scripts/                       # build-all, deploy, ssl, clean-db, generate-*
├── tests/                         # node --test (leads, utils)
├── nginx/                         # crm.inovapro.cloud.conf
├── ecosystem.config.js            # PM2: dashboard/api/worker
├── docker-compose.yml             # Redis local (Postgres opcional comentado)
├── .env(.example)                 # configuração por variáveis de ambiente
└── session/                       # sessão WhatsApp (Baileys) — não versionada
```

### 2.2 Stack

- **Frontend**: Next.js `14.2.15` (App Router), React 18, Tailwind 3, TanStack
  Query, Socket.IO client, Recharts, PWA (manifest + service worker).
- **Backend API**: Express 4 + helmet + cors + multer + zod (rota health);
  Socket.IO server.
- **Worker**: BullMQ 5 (Redis/ioredis 6), Baileys `@whiskeysockets`, Executor
  de filas com concurrency 5.
- **DB**: PostgreSQL via **Neon** (Prisma). Redis para BullMQ + pub/sub realtime
  + locks (SETNX).
- **IA**: Groq (primário) → OpenRouter (fallback); gestão de provider com
  retry/timeout; prompts versionados (`v2`); classificação com fallback
  heurístico sem IA.
- **E-mail**: Resend (envio + webhooks de entrega/abertura/clique/bounce).
- **Infra**: PM2 (3 processos), Nginx + Let's Encrypt, domínio
  `crm.inovapro.cloud`, Node ≥ 20.

### 2.3 API (Express) — rotas existentes

```
GET  /                       → info do serviço
GET  /health                 → liveness + dependências (DB), 503 se DB cair
POST /auth/login | /auth/change-password | /auth/logout
GET  /auth/me
POST /leads/import/preview   → parse CSV/XLSX/pasta; dedup; teste (TEST_MODE_MAX_LEADS)
POST /leads/import/confirm   → enfileira gravação
GET  /leads/imports | /leads | /leads/:id
POST /campaigns | GET /campaigns | GET /campaigns/:id | /:id/leads | /:id/stats
PATCH/POST/DELETE /campaigns (start|pause|resume|finish|pause-all)
GET  /dashboard/metrics | GET/PUT /dashboard/settings
GET  /conversations | /conversations/:id | /:id/takeover | /:id/release | /:id/close
GET  /reports?from&to        → séries diárias, taxas
GET  /whatsapp/status | POST /whatsapp/connect | /whatsapp/disconnect
POST /webhooks/*             → Resend (sem rate limit / sem auth externa)
```

- `leadsRouter`, `campaignsRouter`, `dashboardRouter`, `inboxRouter`,
  `reportsRouter`, `whatsappRouter` usam `requireAuth`.
- CORS restrito a `*.inovapro.cloud`; rate limit global por IP exceto webhooks;
  body limit 10 MB; upload 5 MB (`.csv/.xlsx/.xls`).
- **Chamada do dashboard → API** passa pelo proxy do Next
  (`/api/proxy/[...path]`) injetando o JWT da sessão (`acp_token`).

### 2.4 Banco de dados (Prisma) — modelos e relações

**Auth e global**
- `User` — `email @unique`, `password_hash`, `role` (só `ADMIN`),
  `must_change_password`.
- `Setting` — chave/valor global (limites, teste).

**Prospecção**
- `Lead` — nome, telefone (`@unique`), e-mail, `business_name`, cidade/estado,
  `source`, `status`, `external_id`, fingerprints únicos
  (`fingerprint_phone/email/extid @unique`), vínculo opcional com `LeadImport`.
- `LeadImport` — arquivo, status (`QUEUED|PROCESSING|DONE|FAILED`), resumo JSON.
- `Campaign` — limites diários (WhatsApp/e-mail), `interval_seconds`,
  `is_test`, `start_hour` (janela diária em Brasília), status
  (`ACTIVE|PAUSED|FINISHED`).
- `CampaignLead` — vínculo campanha×lead, status de funil, tentativas,
  `@@unique([campaign_id, lead_id])`.

**Comunicação/Atendimento**
- `Message` — canal (`WHATSAPP|EMAIL`), direção, conteúdo, status
  (`QUEUED...READ|FAILED`), provider, `external_id` (barreira de idempotência).
- `Conversation` — `lead_id @unique`, status (`OPEN|CLOSED`), `human_handled`,
  `ai_provider`, `last_message_at`.

**IA**
- `AIGeneration` — provider, model, `prompt_version`, prompt, completion,
  tokens, latência, erro (auditoria/uso da IA).

**Conformidade**
- `OptOut` — lead×canal×motivo (regulatório).
- `DeliveryEvent` — eventos de webhook do Resend.

**Relações principais**
```
Lead 1─* CampaignLead *─1 Campaign
Lead 1─* Message
Lead 1─1 Conversation 1─* AIGeneration
Lead 1─* OptOut
Message?─* DeliveryEvent
LeadImport 1─* Lead
```

### 2.5 Autenticação e autorização

- JWT HS256 (jose), 7 dias, cookie `httpOnly acp_token`; `SESSION_SECRET`.
- Payload: `{ sub, email, role: 'ADMIN', must_change_password }`.
- Login via `POST /auth/login`; troca de senha obrigatória no 1º acesso
  (painel força `/change-password`; servidor exige `must_change_password=false`).
- **Não há**: refresh token, roles além de `ADMIN`, membership/empresa,
  impersonation, log de auditoria de autenticação.
- Rotas do dashboard protegidas por `middleware.ts` (prefixos fixos).
- **Risco**: o token não carrega tenant; não existe escopo de dados.

### 2.6 IA

- `provider-manager.ts`: tenta Groq; fallback OpenRouter em timeout/5xx/rate
  limit; `AI_TIMEOUT_MS`, modelos configuráveis por env.
- `prompts.ts` (versão `v2`):
  - `AGENT_SYSTEM_PROMPT` — **vendedor do AgendaCorte p/ barbearias e salões**,
    fixa preço `R$ 39,90` e link `https://agendacorte.inovapro.cloud/vitrine`.
  - `CLASSIFICATION_SYSTEM_PROMPT` — classifica intenção em JSON.
  - `OPT_OUT_KEYWORDS` + `detectOptOut()` — opt-out sem IA.
  - `firstContactMessage()` / `buildAgentMessages()` — template de abordagem.
- `classifier.ts`: opt-out por palavras-chave → IA → heurística por regex.
- `agent.ts`: gera a resposta comercial contextualizando o lead.
- **AIGeneration** registra tokens/completion por geração (base para "usage").
- Fluxo: mensagem recebida → `message-received` → `ai-response` → resposta +
  status do lead + realtime.

### 2.7 WhatsApp (Baileys)

- `WhatsAppManager` **singleton** com **uma única sessão** (`WHATSAPP_SESSION_PATH`).
- Robustez: resolução dinâmica da versão WA Web (evita ClientTooOld),
  normalização de JID/LID, envio por telefone com fallback de remoteJid,
  reconexão com backoff (8 tentativas), timeouts, idempotência via claim do
  status da mensagem.
- Sessão persistida só no servidor; QR gerado em `qrDataUrl` para `/settings`.
- Worker recebe mensagens e enfileira `message-received` (locks Redis + verificação
  `external_id` contra duplicidade).
- **Ponto crítico p/ multi-tenant**: conexão única e sem conceito de "dono" da
  sessão — não há capacidade de múltiplas empresas com WhatsApp próprio.

### 2.8 Filas (BullMQ)

`lead-import`, `campaign-processing` (pump com limites + intervalo + janela de
Brasília), `whatsapp-send`, `email-send`, `message-received`, `ai-response`,
`webhook-processing`, `retry` (máx. 3 tentativas WhatsApp), `dead-letter`.

Jobs carregam `leadId/campaignId`, **mas nunca `businessId`** — ao adicionar
tenant, todo job que tocar dados de empresa precisa carregar o contexto.

### 2.9 Tempo real

- Worker → Redis pub/sub (`realtime:events`) → API Socket.IO → navegador.
- Autenticação do socket pelo mesmo JWT (`acp_token` em `handshake.auth` ou cookie).
- Eventos: `new_message_received`, `ai_response_generated`, `status_changed`.
- **Ponto crítico**: `io.emit` é **global** — não há rooms por empresa; um
  usuário receberia eventos de qualquer tenant.

### 2.10 Frontend (dashboard)

- **Login/change-password/dashboard/lead-import/campaigns(+detalhe)/inbox(+detalhe)/reports/settings**.
- Sidebar: Dashboard · Importar leads · Campanhas · Inbox · Relatórios · Configurações.
- `/settings`: conexão WhatsApp (QR), limites padrão e intervalo, "parar tudo".
- `/dashboard`: KPIs atuais já majoritariamente genéricos (mensagens, e-mails,
  respostas, interessados, opt-outs, erros, campanhas) — **sem "cortes hoje"/barbeiros**.
- TanStack Query + Socket.IO singleton (`lib/socket-client.ts`).
- Proxy de API injecting token (`lib/api.ts` + `/api/proxy/[...path]`).
- PWA: manifest dark `#0f0f0f`, service worker com network-first p/ `/api/proxy`.

### 2.11 Deploy/Infra

- `scripts/deploy.sh`: install → symlink `.env` no dashboard → prisma generate →
  migrate → seed → build → PM2 start/save.
- `ecosystem.config.js`: `prospector-dashboard` (next start -p 3005),
  `prospector-api`, `prospector-worker`; logs em `logs/`.
- Nginx: `/` → 3005; `/socket.io/` e `/api/webhooks/` → 4005; `/api/` → 3005.
- Redis: filas + pub/sub; PostgreSQL: Neon (externo).

---

## 3. Pontos específicos de AgendaCorte / barbearia

| Onde | O quê | Impacto |
|---|---|---|
| `services/ai/src/prompts.ts` | `AGENT_SYSTEM_PROMPT` vende AgendaCorte, `R$ 39,90`, link `agendacorte.../vitrine`, público "barbearias e salões" | **Bloqueia** generalização da IA |
| `services/ai/src/prompts.ts` | constante `REGISTRATION_LINK`, `FIRST_MONTH_PRICE` | idem |
| `services/email/src/templates.ts` | "Equipe AgendaCorte", "barbearias e salões", CTA verde AgendaCorte | Branding errado p/ SAVYRON |
| `apps/worker`, logs | `browser: ['AgendaCorte Prospector', ...]` no Baileys; mensagens de log "Worker AgendaCorte Prospector" | Cosmético/dispositivo WA |
| Dashboard | `Logo` texto "agenda corte / Prospector", footer "AgendaCorte Prospector v1.0", metadata title, manifest, appleWebApp title | Branding |
| API worker `ai-response` | `subject: 'Re: AgendaCorte'` no e-mail | Branding |
| Domínio | `crm.inovapro.cloud` (manter; já em produção) | — |

---

## 4. Problemas encontrados (bloqueadores p/ multi-tenancy)

**P1 — Sem modelo de tenant.** Nenhuma entidade tem `businessId`.

**P2 — Unique constraints globais entram em conflito entre empresas:**
`User.email`, `Lead.phone`, `Lead.fingerprint_phone`, `Lead.fingerprint_email`,
`Lead.fingerprint_extid`, `Conversation.lead_id`, `CampaignLead[campaign_id,lead_id]`.
Ex.: o mesmo e-mail/número em duas empresas distintas não pode violar UNIQUE.

**P3 — Queries sem escopo (IDOR).** Leads, campanhas, conversas, mensagens,
relatórios e importações são buscados somente por `id`. Trocar um ID → ler dados
de outra empresa. Precisa de **autorização centralizada**.

**P4 — RBAC inexistente.** Um único papel global `ADMIN`. Sem
PlatformAdmin/Owner/Admin/Broker/Funcionário.

**P5 — WhatsApp singleton.** Uma única sessão; impossível atender várias
empresas com números próprios. Precisará de gerenciador com mapa
`businessId → { manager, sessão, status }`.

**P6 — Realtime global.** `io.emit` sem rooms. Precisa de rooms por empresa +
validação de membership no handshake.

**P7 — IA/branding de AgendaCorte hardcoded.** Prompt do agente, preço e link
fixos; templates de e-mail fixos; inviável para produto horizontal.

**P8 — Configurações globais.** `Setting` é chave/valor global; precisa virar
por empresa (limites, voz da IA, módulos).

**P9 — Auth sem tenant.** JWT não transporta `businessId`/membership;
impersonation não existe.

**P10 — Sem uso/consumo, planos, assinaturas, auditoria** (a base existe mas
não há modelos).

---

## 5. Arquitetura proposta (SAVYRON)

### 5.1 Domínio multi-tenant

```
Business (tenant)
  ├── BusinessMember  (usuário × empresa × papel)
  ├── BusinessSettings (config da empresa: segmento, voz, limites, módulos)
  ├── Contact           (generaliza Lead; um Contact pode ter status "LEAD")
  ├── Conversation / Message / Channel
  ├── Campaign / CampaignLead / LeadImport / OptOut / DeliveryEvent
  ├── AIAgent / AISettings / AIKnowledge / AIGeneration
  ├── Pipeline / PipelineStage / Deal / Task / Note / Tag
  ├── WhatsAppConnection (1-N por empresa, isoladas)
  ├── Subscription / Plan / PlanFeature / Usage / AuditLog
```

- **Nomenслатура**: adotar `businessId` (termo já citado na especificação) como
  equivalente de `tenantId`; `Business` = empresa/tenant.
- Todo job BullMQ carrega `businessId` quando toca dados de empresa.
- Indexes: `businessId`, `businessId+created_at`, `businessId+status`,
  `businessId+campanhaId`, `businessId+contactId/conversationId`, etc.

### 5.2 RBAC

`PLATFORM_ADMIN` (acesso global) │ `OWNER` │ `BUSINESS_ADMIN` │ `MANAGER` │ `AGENT`
no prisma `enum BusinessRole`. `User` vira portador de credenciais; o papel
efetivo vem de `BusinessMember`. Middleware/service central:

```
requireAuth → resolve membreships → requireBusiness(businessId?) →
  verifica role (requireRole(...)) → escopo em toda query
```

Regra de ouro: **nunca confiar em `businessId` vindo do frontend**; derivar da
membership e validar dono do recurso.

### 5.3 Isolamento

- Todos os `findMany/findFirst/count` de dados de empresa filtram por
  `businessId` (helper `tenantWhere`).
- `GET /:id` de qualquer recurso de empresa valida dono → **404/403** se cruzou.
- Realtime: `io.to(businessRoom)`; handshake valida membership.
- WhatsApp: conexão por `businessId`; inbound rotulado com a empresa dona.

### 5.4 IA em camadas (regras internas inalteráveis)

```
SYSTEM (segurança/plataforma — não editável)
  → GLOBAIS SAVYRON (identidade da plataforma, limites, LGPD/opt-out)
  → AGENTE (nome, função, tom, comportamento — config da empresa)
  → EMPRESA (descrição, segmento)
  → KNOWLEDGE (base de conhecimento)
  → CLIENTE (contato) × HISTÓRICO
```
Provider manager (Groq→OpenRouter) preservado; prompts passam a ser montados
por template; `AIGeneration` vira base de **usage** de IA.

### 5.5 WhatsApp por empresa

`WhatsAppManager` atual → `WhatsAppConnectionManager` com mapa por `businessId`
(reutiliza manager/session/QR). `WHATSAPP_SESSION_PATH/<businessId>`. Rotas de
status/conectar/desconectar escopadas por empresa. Nunca compartilhar sessão.

### 5.6 CRM genérico

- `Contact` generaliza `Lead` (status `LEAD` como um estado); manter tabela
  `Lead`/fila de importação por compatibilidade, evoluindo para Contact.
- `Pipeline/PipelineStage/Deal/Task/Note/Tag` novos e configuráveis por empresa.

### 5.7 Módulos

- **Admin (`/admin`)**: dashboard (MRR/ARR/receitas/novos/ativos/churn,
  uso da IA, mensagens), empresas, usuários, planos, assinaturas, pagamentos,
  billing, usage, audit, settings.
- **Prospecção**: módulo do SAVYRON (importação, campanhas, limites, opt-out,
  relatórios) — tudo vinculado a `businessId`.
- **Automação**: apenas arquitetura (Trigger→Condition→Action) p/ fase futura.

---

## 6. Alterações no banco (incrementais, reversíveis)

Ordem segura (sem apagar dados):

1. Criar `Business`, `BusinessMember`, `BusinessSettings`, `Plan`,
   `PlanFeature`, `Subscription`, `Usage`, `AuditLog`, `AIAgent`,
   `AISettings`, `AIKnowledge`, `WhatsAppConnection`, `Contact`/`Pipeline`/etc.
2. Adicionar coluna `business_id` nullable em `Lead`, `LeadImport`, `Campaign`,
   `CampaignLead`, `Message`, `Conversation`, `AIGeneration`, `OptOut`,
   `DeliveryEvent`, `Setting`. Backfill p/ empresa padrão ("AgendaCorte / Inova").
3. Tornar `business_id` `NOT NULL` + índices compostos.
4. Substituir unique globais por **composite com business**:
   - `Lead[business_id, phone]`, `[business_id, fingerprint_*]`
   - `Conversation[business_id, lead_id]`
   - `CampaignLead[business_id, campaign_id, lead_id]`
   - `User.email` → **global único mantido** (conta de login é única); email de
     `Business` pode não ser unique global (avaliar).
5. `User` ganha vínculos (opcional) e papéis migram para `BusinessMember`
   (coluna `role` de `User` vira legado/`PLATFORM_ADMIN`).

`clean-db.mjs` deve continuar preservando User/Setting em *account-level*.

---

## 7. Alterações no backend (API/Worker)

- Novo `requireBusiness` + resolução de membership + helper de escopo.
- Prefixar novas rotas por domínio:
  `/auth /business /contacts /companies /deals /pipelines /tasks /conversations
  /messages /ai/agents /ai/knowledge /ai/playground /whatsapp /campaigns
  /prospecting /reports /subscription /usage /admin /audit`
  (manter compatibilidade das rotas atuais).
- Worker: jobs com `businessId`; processors escopados; realtime por room.
- IA: `prompt assembler` em camadas; AISettings/AIAgent/AIKnowledge por empresa;
  playground sem envio real.
- Novo endpoint de administração com RBAC `PLATFORM_ADMIN`.
- `usage` gravado a partir de Message/AIGeneration (contadores por período).
- `AuditLog` para login/logout/CRUD/plano/IA/impersonation/suspensão.

---

## 8. Alterações no frontend

- Branding: título/metadata/manifest/logo/footer → **SAVYRON** (mantendo
  domínio e compatibilidade técnica).
- Sidebar expandida (Dashboard; CRM: Contatos/Empresas/Negócios/Pipeline/Tarefas;
  Atendimento: Inbox; WhatsApp; IA: Agentes/Conhecimento/Playground;
  Automação; Agenda; Prospecção; Relatórios; Configurações). Sidebar Admin.
- `/settings/business` (Meu Negócio), `/ai/settings`, `/ai/knowledge`,
  `/ai/playground`, rotas `/admin/*`.
- Menu dinâmico por feature flags/plano; ocultar ao que não está contratado
  **e** validar no backend.
- Dashboard genérico (novos contatos, conversas, negócios, conversão,
  atendimentos, tarefas, agendamentos, mensagens, IA).
- Banner de impersonation + saída da sessão de suporte.

---

## 9. Riscos

1. **IDOR**: qualquer rota sem escopo vaza dados entre empresas → prioridade #1.
2. **Unique + backfill**: colisões de `phone/e-mail/fingerprint` entre empresas
   após criar composites — revisar duplicados antes de `NOT NULL`/unique.
3. **WhatsApp multi-conexão**: Baileys com N sessões aumenta memória/custo e
   complexidade de reconexão; manter uma conexão por empresa e limites por plano.
4. **IA comportamental**: cliente pode instruir o agente a burlar regras → as
   camadas de segurança/plataforma precisam ser imutáveis e testadas.
5. **Realtime**: eventos devem ir só para o room da empresa (evitar vazamento).
6. **Migração com dados vivos**: aplicar colunas nullable + backfill + NOT NULL
   em janela de manutenção; `clean-db` continua destrutivo intencional.
7. **Compatibilidade**: não quebrar rotas usadas por Nginx/PWA/proxy; manter
   `acp_token`, portas, domínio.
8. **Escopo**: implementar em fases com typecheck/lint/test/build após cada uma.

---

## 10. Estratégia de migração

1. **Backup lógico** da estrutura/banco antes de tocar no Prisma.
2. Criar empresa padrão **"AgendaCorte / Inova"** (slug `inova`) como tenant
   inicial; `User` admin torna-se membro `OWNER`/`PLATFORM_ADMIN`.
3. Backfill de `business_id` nos registros existentes para essa empresa.
4. Migrações incrementais e reversíveis; composite unique com limpeza prévia.
5. Manter IDs existentes (cuid()); não recriar dados.
6. Script dedicado (novo `scripts/migrate-tenant.mjs` ou similar) executado uma
   vez em produção, com logs; `clean-db.mjs` atualizado para o novo schema.
7. Ao final, dados legados continuam acessíveis sob a empresa padrão; teste que
   provam isso.

---

## 11. Ordem de implementação

| Fase | Entrega | Gate |
|---|---|---|
| 1 | Auditoria (este documento) | ✔ |
| 2 | Multi-tenant (Business, BusinessMember, roles, isolamento, migração) | ✔ (2026-08-12) |
| 3 | Admin `/admin` (empresas, usuários, planos, assinaturas, impersonation) | typecheck/lint/test/build |
| 4 | Meu Negócio `/settings/business` + settings por empresa | idem |
| 5 | IA (AIAgent, AISettings, AIKnowledge, Playground) | idem |
| 6 | Generalização CRM (Contact, pipeline, deals, tasks) | idem |
| 7 | Prospecção como módulo do SAVYRON | idem |
| 8 | Usage/billing/auditoria | idem |
| 9 | UI/branding SAVYRON | idem |
| 10 | Testes hardening (isolamento, RBAC, IDOR, build, migrações) | idem |

Prioridades: **segurança → integridade → multi-tenancy → compatibilidade →
funcionalidade → UI**.

---

## 12A. Fase 2 — Multi-tenant (concluída 2026-08-12)

### Banco (aplicado em produção com backup)
- Migração `20260812000000_multi_tenant` (incremental/reversível, validada em
  transação antes de aplicar): enums `BusinessStatus`, `BusinessRole`,
  `PlatformRole`; tabelas `Business`, `BusinessSettings`, `BusinessMember`;
  `business_id` (NOT NULL) em Lead, LeadImport, Campaign, CampaignLead,
  Message, Conversation, AIGeneration, OptOut, DeliveryEvent; `platform_role`
  em User; backfill p/ empresa padrão `cin_default_agendacorte`
  ("AgendaCorte / Inova", slug `agendacorte`) com Settings + member OWNER;
  uniques compostos por empresa (fingerprints, conversation-lead, campaign-lead).
- Backup CSV completo dos dados em `backups/20260812_005017/` (pré-migração).

### Backend / API
- JWT: `businessId` + `businessRole` + `platform_role` no payload.
- Login/me retornam `businesses`, `active_business`; novas rotas
  `POST /auth/select-business` e `GET /auth/businesses` (valida membership →
  403 se não pertence; sem IDOR).
- Middleware `requireBusiness` e `requireRole(roles)`; rotas de leads,
  campaigns, inbox, dashboard, reports, whatsapp, webhooks escopadas por
  `business_id`; settings por empresa via `BusinessSettings`
  (`getBusinessSettings`/`setBusinessSettings`/`getBusinessSettingInt`).

### Worker
- Jobs carregam `businessId`; services (`leads`, `messages`, `conversations`,
  `realtime`) escopados; pumps, envios e webhooks respeitam a empresa;
  importação (`persistLeads`/`loadExistingFingerprints`) por `businessId`.

### WhatsApp (multi-instância)
- `WhatsAppConnection` por empresa (diretório `session/<businessId>`);
  `whatsappRegistry`/`getWhatsAppManager(businessId)`; conexões default +
  todas as empresas com sessão no boot; endpoints `/whatsapp/*` aceitam
  `businessId` (query/body). Empresa padrão usa diretório raiz (legado) —
  conexão WhatsApp existente preservada.

### Realtime
- `RealtimeEventMessage.businessId`; socket entra na sala da empresa
  (`socket.join(businessId)`); broadcast restrito à sala.

### Frontend
- `SessionPayload` com `businessId`/`businessRole`/`platform_role`; sessão
  (cookie acp_token) já carrega o contexto; login/me proxy funcionando.

### Verificação
- `npm run typecheck`, `npm run lint`, `npm test` (9/9), `npm run build` — OK.
- Smoke live: login → businesses/active_business → `/leads` (291, escopado) →
  `/campaigns` (1, business_id correto) → `/dashboard/metrics` (limites do
  BusinessSettings) → `/whatsapp/status` (connected via sessão legada) →
  `select-business` (OK p/ própria, 403 p/ outra) → dashboard `/api/auth/me`
  com `businessId`/`businessRole` no cookie.

---

## 12B. Fase 3 — Admin + Billing + Onboarding (concluída 2026-08-12)

### Banco (aplicado em produção, sem perda de dados)
- Migração `20260812010000_billing_onboarding`: `BusinessStatus` + `PENDING_PAYMENT`;
  tabelas `Plan`, `PlanFeature`, `Subscription`, `Payment`, `EmailVerification`,
  `Usage`, `AuditLog`; enums `BillingInterval`, `SubscriptionStatus`,
  `PaymentStatus`, `PaymentMethod`.
- Migração `20260812010100_delivery_event_business_nullable`: corrige drift —
  `DeliveryEvent.business_id` nullable (webhook Resend cria evento sem empresa).
- Seed atualizado: planos `initial` (R$ 0), `professional` (R$ 39,90),
  `enterprise` (R$ 99,90), cada um com 10 features; admin já era `PLATFORM_ADMIN`.

### Fluxo de onboarding (cadastro → verificação → plano → pagamento)
- `POST /auth/send-code`, `POST /auth/verify-code`, `POST /auth/signup`,
  `GET /auth/plans` (público): código de 6 dígitos via Resend (hash+salt,
  expiração 10 min, rate limit por hora/reenvio, tentativas limitadas, uso
  único). Signup cria User + Business `PENDING_PAYMENT` + membership OWNER +
  Subscription TRIALING (transação), sem duplicidade.
- `POST /billing/checkout/pix` (QR Code PIX ASAAS, idempotente por cobrança
  pendente) e `POST /billing/checkout/card` (cartão repassado ao ASAAS, número
  nunca persistido); `POST /billing/activate-free` (somente plano R$ 0);
  `GET /billing/status` (status empresa/assinatura/pagamento p/ polling).
- Webhook `POST /webhooks/asaas` (rota pública via nginx, já existente):
  valida `asaas-access-token`, deduplica por evento (cache + AuditLog),
  processa `PAYMENT_CONFIRMED/RECEIVED/CREDIT_CARD_CAPTURED/OVERDUE/CANCELLED`
  com idempotência por `asaas_payment_id`. Só ativa a empresa quando o gateway
  confirma (RECEIVED/CONFIRMED). E-mail de ativação via Resend.

### Segurança
- CPF/CNPJ coletado no signup e enviado ao customer ASAAS (obrigatório em
  produção); `ensureAsaasCustomer` atualiza CPF se faltar — nunca duplica
  customer; checkout deriva `businessId` do token (nunca do cliente).
- Error handler expõe mensagens reais de 4xx (ex.: ASAAS).

### Painel `/admin` (PLATFORM_ADMIN/PLATFORM_STAFF)
- `GET /admin/dashboard` (MRR, ARR, receita mês/total, empresas por status,
  churn, assinaturas vencidas, pagamentos pendentes, uso de IA).
- `/admin/businesses` (+`/:id`, PATCH, status SUSPEND/REACTIVATE/CANCEL),
  `/admin/plans` (GET/POST/PATCH), `/admin/subscriptions`, `/admin/payments`,
  `/admin/users` (+PATCH, POST), `/admin/usage`, `/admin/audit`,
  `/admin/settings`.
- **Impersonation**: `POST /admin/impersonate` (valida PLATFORM_ADMIN, emite
  token com `impersonating`+`impersonator`, registra sessão de suporte em
  AuditLog com admin/IP/motivo); `POST /admin/impersonate/exit` devolve token
  sem empresa. Banner "Você está acessando esta empresa como administrador da
  plataforma" + saída.

### Frontend
- `/signup` (wizard: e-mail+código → empresa → plano), `/payment` (PIX com QR +
  polling 5s, cartão, ativação de plano grátis), `/admin/*` (layout com sidebar
  + banner de suporte), login roteia por status da empresa
  (PENDING_PAYMENT→/payment; SUSPENDED/CANCELLED→mensagem).
- Proxy genérico: whitelist de rotas públicas de onboarding; rotas novas
  `session/set` e `session/clear` p/ auto-login pós-signup e impersonation.
- Middleware protege `/payment` e `/admin`; `/signup` público.

### Configuração (env)
- `ASAAS_API_KEY`, `ASAAS_API_URL`, `ASAAS_ENVIRONMENT`,
  `ASAAS_WEBHOOK_AUTH_TOKEN` (adicionadas ao config e `.env.example`).
- Resend reutiliza a conta do projeto AgendaCorte (`RESEND_FROM_EMAIL` =
  `contato@inovapro.shop`, domínio verificado; `EMAIL_FROM_NAME` = `SAVYRON`).

### Verificação (smoke em produção)
- plans públicos; send-code via Resend (domínio verificado); verify-code
  rejeita código errado; signup (PENDING_PAYMENT) sem duplicidade; checkout PIX
  gera QR real no ASAAS; webhook com token ativa a empresa (ACTIVE/RECEIVED);
  webhook duplicado → `duplicate:true`; plano grátis ativa sem ASAAS;
  impersonation só p/ PLATFORM_ADMIN (403 p/ usuário comum) e token impersonado
  acessa dados da empresa + exit remove businessId; `/admin/dashboard` com
  métricas reais.
- Gates: `npm run typecheck`, `npm run lint`, `npm test` (9/9),
  `npm run build`, `next build` (rotas /signup /payment /admin/*) — OK.
- Dados de teste criados durante o smoke foram removidos do banco.

---

## 12C. Fase 4 — Meu Negócio (concluída 2026-08-12)

### Banco
- Migração `20260812020000_business_settings`: `BusinessSettings` expandido
  com `address`, `website`, `instagram`, `opening_hours`, `timezone`
  (default `America/Sao_Paulo`), `logo_url`, `additional_info`.

### Backend
- `GET/PATCH /business/settings` (router `/business`): visão combinada
  Business (nome, segmento, descrição, e-mail, telefone, CNPJ) +
  BusinessSettings. `businessId` SEMPRE do token; escrita restrita a
  `OWNER`/`BUSINESS_ADMIN` (`requireRole`); leitura para qualquer membro
  autenticado; alterações auditadas em `AuditLog`.
- `setBusinessSettings` ampliado com os novos campos (upsert).

### Frontend
- `/settings/business` (Meu negócio): formulário responsivo no padrão do
  dashboard — identificação, segmento (lista horizontal), presença/localização,
  horário, fuso, logo e informações adicionais. Link na sidebar (seção Empresa).

### Verificação
- GET/PATCH em produção OK; persistência confirmada. Gate typecheck/lint/test/build OK.

---

## 12D. Fase 5 — IA (concluída 2026-08-12)

### Banco
- Migração `20260812030000_ai_models`: `AIAgent`, `AISettings` (1 por
  empresa), `AIKnowledge`; enums `AITone` e `AIKnowledgeCategory`; índices
  por `business_id`.

### IA — prompt em camadas (sem barbearia hardcoded)
- `services/ai/src/prompts.ts` limpo: removidos `AGENT_SYSTEM_PROMPT`,
  `REGISTRATION_LINK`, `FIRST_MONTH_PRICE` (venda do AgendaCorte). Mantidos
  `PROMPT_VERSION` (v3), classificação, opt-out e primeira mensagem (genérica).
- `prompt-assembler.ts` (novo): monta o prompt em camadas obrigatórias —
  1. SYSTEM; 2. REGRAS DE SEGURANÇA (imutável); 3. REGRAS GLOBAIS (imutável);
  4. AGENTE; 5. EMPRESA (segmento/descrição/tom/comportamento/mensagens/
  customPrompt); 6. CONHECIMENTO; 7. AVISO FINAL DE SEGURANÇA (reforço).
  O `customPrompt` do cliente entra só nas camadas 4/5 — regras de segurança
  permanecem íntegras (testadas).
- `agent.ts`: `generateAgentReply(context, { systemPrompt | agentConfig })` e
  `buildSystemPrompt(input)`; provider-manager ganhou `getPrimary()`.
- Worker `ai-response.processor`: carrega AIAgent/AISettings/AIKnowledge +
  negócio da empresa, monta o prompt em camadas e remove a lógica de anexar o
  link de cadastro do AgendaCorte. `subject: 'Re: seu contato'`.
- E-mails de campanha (`templates.ts`) generalizados (sem "barbearias e
  salões" / "Equipe AgendaCorte").

### API
- Router `/ai` (escopo por `businessId` do token):
  - `GET/POST/PATCH/DELETE /ai/agents`
  - `GET/PATCH /ai/settings` (GET cria default; PATCH exige OWNER/ADMIN)
  - `GET/POST/PATCH/DELETE /ai/knowledge`
  - `GET /ai/playground/status` e `POST /ai/playground` — gera resposta com a
    config da empresa + agente + conhecimento + regras globais; **isolado:
    nunca enfileira/envia WhatsApp/e-mail reais**; auditoria de uso.
- RBAC: escrita de agentes/settings/knowledge exige `OWNER`/`BUSINESS_ADMIN`.

### Frontend
- `/ai/settings` (identidade do agente, tom, comportamento, mensagens, prompt
  personalizado), `/ai/knowledge` (CRUD + ativar/desativar), `/ai/playground`
  (teste isolado com metadados de modelo/tokens). Seção "IA" na sidebar.
- Middleware: `/ai` adicionado às rotas protegidas.

### Testes (novos, 6)
- `tests/ai-prompt.test.mjs`: ordem das camadas; configurações diferentes →
  prompts diferentes; conhecimento influencia; `customPrompt` malicioso não
  sobrescreve regras de segurança (aparece antes do aviso final e as regras
  permanecem íntegras); sem resquício de AgendaCorte/preço/link.

### Verificação (produção)
- `/ai/settings`, `/ai/agents`, `/ai/knowledge`, `/ai/playground` OK. O
  playground respondeu usando a base de conhecimento ("segunda a sexta, das
  9h às 18h...") com agente e provider corretos — config da empresa influencia
  a resposta. Isolamento de tenant provado: empresa B não vê knowledge nem
  settings da empresa A (IDOR). Dados de teste removidos; settings da empresa
  padrão resetados para default; agente padrão "Agente de Atendimento" mantido.
- Gates: `npm run typecheck`, `npm run lint`, `npm test` (15/15), `npm run build`,
  `next build` — OK.

> **Pendente (fora desta fase)**: branding visual restante (manifest/layout/
> whatsapp browser/logs com "AgendaCorte") é escopo da Fase 9; o nome do tenant
> legado `AgendaCorte / Inova` é mantido por compatibilidade.

---

## 12E. Migração de Gateway: ASAAS → Stripe + correção signup (2026-08-13)

### Decisão de arquitetura — Checkout Stripe hospedado
Escolhido **Stripe Checkout (`mode: subscription`)** em vez de PaymentIntent +
Elements embutido: menos reescrita no frontend `/payment` (redirect + polling
existente), cartão/PIX tokenizados na própria Stripe (nunca passam pelo
backend), suporte a PIX via métodos dinâmicos e manutenção mais simples.
`payment_method_configuration` é usada quando configurada (a `pmc_1U3kz...`
fornecida não existe na conta INOVAPRO — erro da Stripe confirmado; cai para
métodos dinâmicos: cartão agora, PIX quando ativado no dashboard).

### Setup Stripe (via MCP, modo TESTE)
- Produtos: `prod_V3tHc8ZQxy2wCX` (Inicial), `prod_V3tHZ3UXY6Dz8z`
  (Profissional), `prod_V3tHLB99MLu9iM` (Empresa).
- Preços mensais: `price_1U3lVPLWyC4uRc8x0g0nrcps` (R$ 39,90),
  `price_1U3lVTLWyC4uRc8xeUTblCms` (R$ 99,90). Inicial = R$0, sem preço Stripe.
- Webhook endpoint `we_1U3lVhLWyC4uRc8xaurA7q4X`: URL
  `https://crm.inovapro.cloud/api/webhooks/stripe` (bate com Nginx
  `/api/webhooks/` → `:4005/webhooks/`), estilo instantâneo, API version
  `2025-08-27.basil`, **eventos restritos** (não os 238): checkout.session.completed,
  customer.subscription.created/updated/deleted, invoice.payment_succeeded,
  invoice.payment_failed.

### Banco
- Migração `20260812050000_stripe_gateway`: `Plan.stripe_product_id`,
  `Plan.stripe_price_id`, `Subscription.stripe_customer_id`,
  `stripe_subscription_id`, `stripe_price_id`; `Payment.stripe_payment_intent_id`,
  `stripe_checkout_session_id`, `stripe_charge_id`. Colunas `asaas*` mantidas
  como legado (nullable) — nenhuma perda de dados; migration reversível.
- Seed: planos vinculados aos produtos/preços Stripe; plano `initial` agora
  fica `active: false` (sem plano grátis no cadastro).

### Backend (runtime via SDK `stripe-node` v22)
- `services/stripe.ts`: cliente Stripe (singleton, apiVersion `2026-07-29.dahlia`),
  `constructStripeEvent`, `createCheckoutSession` (customer + price + pmc ou
  métodos dinâmicos), retrieve/cancel/update subscription, mapeamento de status.
- `services/stripe-billing.ts`: máquina de estados preservada do ASAAS —
  `ensureStripeCustomer` (nunca duplica), `createStripeCheckout` (idempotente:
  reutiliza checkout pendente), `processCheckoutCompleted`,
  `processSubscriptionStatus`, `processSubscriptionDeleted`,
  `processInvoicePaymentSucceeded` (ativa Business/Subscription),
  `processInvoicePaymentFailed` (NÃO ativa). Nunca ativa sem confirmação real.
- Rotas: `POST /billing/checkout` (novo fluxo Stripe); `/activate-free` e
  `/status` mantidos; `/checkout/pix|card` legados (ASAAS) até virada completa.
- Webhook `POST /webhooks/stripe`: valida assinatura com
  `stripe.webhooks.constructEvent`, deduplica por `event.id` (cache + AuditLog,
  mesmo padrão ASAAS), processa assíncrono, registra `AuditLog`.
  **Importante**: o `express.json()` global altera o body antes do webhook e
  quebra o HMAC do Stripe — por isso `express.raw({type:'*/*'})` com `verify`
  captura `req.rawBody` ANTES do parser JSON e o handler usa o Buffer bruto
  para `constructEvent` (a assinatura é calculada sobre o payload exato). Sem
  isso, todo evento retornava `INVALID_SIGNATURE` mesmo com secret correto.
- Admin: reconcile de pagamentos agora é agnóstico (Stripe prioritário, ASAAS
  legado); admin subscriptions/payments expõem `stripe*` (ASAAS como histórico).

### Frontend
- `/payment`: botão "Continuar para pagamento" → cria Checkout Session e
  redireciona para a Stripe; polling de status mantido; plano R$0 mantém
  ativação local. Admin refs `stripeCustomerId`/`stripeSubscriptionId`.
- `/signup`: corrigido `publicCall` para ler o corpo como texto antes de
  tentar JSON (elimina "Falha ao ler resposta" sem informação útil — a causa
  era a API reiniciando durante o deploy); texto de plano grátis removido.

### Remoção do plano grátis
- Plano `initial` (R$0) desativado: banco (`active:false`), seed
  (`active: price > 0`), `listActivePlans` (filtra `price > 0`), signup
  rejeita plano grátis/inativo. Novos cadastros veem só Profissional e Empresa.
  `activate-free` mantido apenas para empresas legadas.

### Migração INOVAPRO TECHNOLOGY (assinatura existente)
- Estratégia: **migrar sem perder histórico**. Customer Stripe já criado e
  vinculado (`cus_V3tfU4JWbrFGqO`); assinatura mantém `TRIALING` (trial ASAAS
  continua valendo); renovação futura passa a usar a Checkout Session Stripe
  (idempotente, testada). Colunas `asaas_customer_id`/`asaas_subscription_id`
  preservadas como legado até confirmar a virada completa.

### Verificação (modo teste)
- Checkout cria customer sem duplicar; `/billing/checkout` idempotente (mesmo
  paymentId em chamadas repetidas); `constructEvent` aceita assinatura válida,
  rejeita inválida e payload alterado; signup → checkout Stripe validado de
  ponta a ponta com empresa smoke (dados de teste removidos). Webhook Stripe
  validado ponta a ponta com o signing secret real `whsec_***` do destino
  "CRM": evento assinado → `200 {"received":true}` + registro em AuditLog;
  assinatura inválida → `400`. Webhook ASAAS continua funcional com o
  `express.raw` na frente do parser JSON.
- Gates: `npm run typecheck`, `npm test`, `npm run build`, `next build` — OK.

> **Webhook Stripe validado ponta a ponta** com o signing secret real do endpoint
> "CRM" (whsec_ no `.env`): evento assinado → `200 {"received":true}`; inválida
> → `400`. Fix necessário: o `express.json()` global alterava o body e quebrava
> o HMAC — capturado `req.rawBody` (Buffer) via `express.raw` antes do parser.

---

## 12G. Remoção completa do ASAAS (2026-08-13)

### Backend (API)
- **Serviço `services/asaas.ts` deletado** (cliente HTTP ASAAS, customer/subscription/
  PIX/cartão, QR Code, status helpers).
- `services/billing.ts`: removidos `ensureAsaasCustomer`, `createPixCheckout`,
  `createCardSubscription`, `processPaymentConfirmed/Overdue/Cancelled` e o sync
  ASAAS em `changeSubscriptionPlan`/`cancelSubscription`/`reactivateSubscription`.
  `cancelSubscription` agora cancela a assinatura Stripe (best-effort via
  `cancelStripeSubscription` reexportado de `stripe-billing`).
- `routes/billing.ts`: removidas `POST /billing/checkout/pix` e `/checkout/card`
  (LEGADO ASAAS); `/billing/status` sem `asaas_payment_id`.
- `routes/webhooks.ts`: removida `POST /webhooks/asaas` (rota agora retorna 404)
  e funções de dedup ASAAS.
- `routes/admin.ts`: reconcile reescrito — **apenas Stripe** (usa os handlers
  `processInvoicePaymentSucceeded`/`processInvoicePaymentFailed`); removido o
  bloco ASAAS legado e `asaas_synced` dos metadados de audit.
- `services/stripe.ts`/`stripe-billing.ts`: comentários de referência ao ASAAS
  removidos.

### Config / Env
- `config`: bloco `asaas` removido.
- `.env` e `.env.example`: variáveis `ASAAS_*` removidas (key produção/url/
  environment/webhook token). Restam apenas `STRIPE_*`.

### Banco (migração `20260813060000_remove_asaas`)
- `Payment.asaas_payment_id` + índice único: **removidos**.
- `Subscription.asaas_customer_id` / `asaas_subscription_id` + índices: **removidos**.
- Dados legados ASAAS (ids da INOVAPRO `cus_000193418553`/`sub_5p3fc756cf5ij01d`
  e histórico de pagamento) descartados — confirmado pelo usuário. A INOVAPRO
  permanece ativa via Stripe (`cus_V3tfU4JWbrFGqO`), gateway atual.
- Migração aplicada via `prisma migrate deploy` (o `migrate dev` falhava no
  shadow DB por causa da migração `init`).

### Frontend (dashboard)
- `lib/admin.ts`: campos `asaas_customer_id`/`asaas_subscription_id`/
  `asaas_payment_id` removidos das interfaces.
- `admin/payments`: texto "Stripe / ASAAS legado" → "Stripe"; exibição do id
  Stripe; botão "Reconciliar" só quando há `stripe_payment_intent_id`.
- `admin/subscriptions`: "cancelada no ASAAS" → "no Stripe"; refs Stripe no
  lugar de ASAAS; bloco "Legado ASAAS" removido do detalhe.

### Verificação
- Gates: typecheck OK, 24/24 testes, build API OK, next build OK.
- Webhook Stripe validado (`200`); `/webhooks/asaas` → `404`; `/billing/status`
  OK (INOVAPRO TRIALING, sem asaas); `POST /billing/checkout` gera URL Stripe OK.
- Deploy: `pm2 restart` API + dashboard; config dist sem referências a asaas.

---

## 12F. Stripe — Payment Method Domain (2026-08-13)

### Contexto
O dashboard Stripe listava apenas domínios de outros projetos/da própria
Stripe (`buy.stripe.com`, `checkout.stripe.com`, `word.gringostarnacional.shop`).
O domínio de produção do SAVYRON (`crm.inovapro.cloud`) não estava cadastrado,
o que impede Apple Pay / Google Pay / Link / PayPal / Klarna quando usados via
Elements embutido.

### Setup (modo TESTE, via SDK `stripe-node` — MCP não expõe paymentMethodDomains)
- Recurso `paymentMethodDomains.create({ domain_name: 'crm.inovapro.cloud', enabled: true })`
  → criado `pmd_1U3uuOLWyC4uRc8xxV2FESJO`.
- Status: **Ativado** — `apple_pay: active`, `google_pay: active`, `link: active`.
- Domínios pré-existentes permaneceram **inalterados** (nenhum outro recurso tocado).
- Verificação: conforme a doc atual da Stripe (desde abr/2025) não é mais preciso
  servir arquivo de verificação no domínio para Apple Pay na web — o cadastro via
  API já ativa. O domínio responde em HTTPS (Nginx).

### Observação
O CRM usa **Checkout hospedado** (redirect para `checkout.stripe.com`) — o
dashboard não carrega `stripe.js`/Elements. Logo, o cadastro do domínio é uma
**preparação para uso futuro** de Apple Pay/Google Pay/Link via Elements, não um
bloqueador do fluxo atual. Repetir em modo `live` quando o gateway for a produção.

---

## 12. Testes obrigatórios (fase 10)

- **Multi-tenant**: Empresa A não acessa dados de B (retorna 403/404).
- **RBAC**: funcionário não acessa ações de admin/plataforma = 403.
- **IA**: config da empresa influencia resposta; camadas de segurança prevalecem.
- **Playground**: não envia para WhatsApp real.
- **Planos**: feature bloqueada quando não contratada (backend != frontend).
- **WhatsApp**: sessões isoladas por empresa.
- **API**: troca de `businessId/contactId/conversationId/messageId` → 403/404.
- **Migração**: dados legados continuam acessíveis sob a empresa padrão.
- Regressões: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.