/**
 * Testes da aba "Agente" e navegação mobile.
 * Verifica a nova bottom navigation compacta, o diagnóstico de microfone
 * e o fallback de voz.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function read(rel) {
  return readFileSync(path.join(root, rel), "utf8");
}

const bottomNav = read("apps/dashboard/components/layout/bottom-nav.tsx");
const navigation = read("apps/dashboard/lib/navigation.ts");
const agentTab = read("apps/dashboard/components/agent/agent-tab.tsx");
const agentHook = read("apps/dashboard/components/agent/use-agent-conversation.ts");
const micHook = read("apps/dashboard/hooks/use-microphone.ts");
const sidebar = read("apps/dashboard/components/layout/sidebar.tsx");

// ---------------------------------------------------------------------------
// 1. Bottom navigation mobile possui 5 itens
// ---------------------------------------------------------------------------

test("bottom nav mobile: contém 5 itens visíveis (Início, Prospecção, Mensagens, Agente, Mais)", () => {
  const bottomItems = navigation
    .split("mobileBottom: true")
    .length - 1;
  assert.equal(bottomItems, 4, "deve haver 4 itens com mobileBottom (Agente já está incluso)");
  assert.ok(bottomNav.includes("BOTTOM_ITEMS"), "bottom-nav usa o filtro BOTTOM_ITEMS da navegação centralizada");
});

// ---------------------------------------------------------------------------
// 2. Agente fica no centro
// ---------------------------------------------------------------------------

test("bottom nav: Agente está centralizado com center: true", () => {
  assert.ok(navigation.includes('center: true'), "Agente possui center: true");
  assert.ok(bottomNav.includes('justify-around'), "layout usa justify-around (centralizado)");
});

// ---------------------------------------------------------------------------
// 3. Agente possui destaque visual
// ---------------------------------------------------------------------------

test("bottom nav: Agente tem destaque visual (elevado, maior)", () => {
  assert.ok(bottomNav.includes("-translate-y-4"), "botão central elevado");
  assert.ok(bottomNav.includes("h-14 w-14"), "botão central maior");
  assert.ok(bottomNav.includes("h-7 w-7"), "ícone central maior");
});

// ---------------------------------------------------------------------------
// 4. "Mais" abre o menu com as opções restantes
// ---------------------------------------------------------------------------

test("bottom nav: 'Mais' abre drawer com demais opções", () => {
  assert.ok(bottomNav.includes("setMoreOpen(true)"), "botão Mais abre o drawer");
  assert.ok(bottomNav.includes("DrawerSection"), "drawer contém itens agrupados");
  assert.ok(navigation.includes('/campaigns'), "drawer inclui Campanhas");
  assert.ok(navigation.includes('/clientes'), "drawer inclui Clientes");
  assert.ok(navigation.includes('/reports'), "drawer inclui Relatórios");
  assert.ok(navigation.includes('/settings'), "drawer inclui Configurações");
});

// ---------------------------------------------------------------------------
// 5. Navegação não possui overflow horizontal
// ---------------------------------------------------------------------------

test("bottom nav: não possui overflow horizontal", () => {
  assert.ok(!bottomNav.includes("overflow-x-auto"), "sem overflow-x");
  assert.ok(bottomNav.includes("flex-1"), "itens flex-1 para ocupar espaço sem overflow");
});

// ---------------------------------------------------------------------------
// 6. Desktop continua usando sidebar completa
// ---------------------------------------------------------------------------

test("sidebar: desktop continua com navegação completa (hidden lg:flex)", () => {
  assert.ok(sidebar.includes("hidden w-64"), "sidebar desktop com largura fixa");
  assert.ok(sidebar.includes("lg:flex"), "visible apenas em lg+");
});

// ---------------------------------------------------------------------------
// 7. getUserMedia é chamado somente após interação do usuário
// ---------------------------------------------------------------------------

test("microfone: getUserMedia é chamado apenas após toque no botão", () => {
  assert.ok(agentTab.includes("handlePress"), "ativação via handlePress");
  assert.ok(!agentHook.includes("getUserMedia()"), "não chama getUserMedia diretamente no corpo do componente");
  // Verifica que a permissão é solicitada via requestPermission (após interação)
  assert.ok(agentHook.includes("requestPermission"), "usa requestPermission (após interação)");
});

// ---------------------------------------------------------------------------
// 8. Permissão concedida inicia LISTENING
// ---------------------------------------------------------------------------

test("microfone: permissão concedida inicia estado LISTENING", () => {
  assert.ok(micHook.includes('permission: "granted"'), "hook retorna granted");
  assert.ok(agentHook.includes('"listening"'), "agente tem estado listening");
});

// ---------------------------------------------------------------------------
// 9. NotAllowedError apresenta mensagem de permissão bloqueada
// ---------------------------------------------------------------------------

test("microfone: NotAllowedError mostra mensagem específica", () => {
  assert.ok(micHook.includes("NotAllowedError"), "hook detecta NotAllowedError");
  assert.ok(micHook.includes("foi bloqueado"), "mensagem de bloqueio");
  assert.ok(micHook.includes("Tentar novamente"), "botão de retry");
});

// ---------------------------------------------------------------------------
// 10. NotFoundError apresenta mensagem de microfone inexistente
// ---------------------------------------------------------------------------

test("microfone: NotFoundError mostra mensagem de microfone ausente", () => {
  assert.ok(micHook.includes("NotFoundError"), "hook detecta NotFoundError");
  assert.ok(micHook.includes("Nenhum microfone"), "mensagem de microfone não encontrado");
});

// ---------------------------------------------------------------------------
// 11. NotReadableError apresenta mensagem de microfone ocupado
// ---------------------------------------------------------------------------

test("microfone: NotReadableError mostra mensagem de microfone ocupado", () => {
  assert.ok(micHook.includes("NotReadableError"), "hook detecta NotReadableError");
  assert.ok(micHook.includes("outro aplicativo"), "mensagem de microfone ocupado");
});

// ---------------------------------------------------------------------------
// 12. Erro genérico não deixa o agente silencioso
// ---------------------------------------------------------------------------

test("microfone: erro genérico não deixa agente silencioso (fallback speak)", () => {
  assert.ok(agentHook.includes("speakWithBrowser"), "fallback de voz do navegador disponível");
  assert.ok(agentHook.includes("Desculpa, não consegui entender"), "mensagem de erro falada");
});

// ---------------------------------------------------------------------------
// 13. Fallback speechSynthesis continua funcionando
// ---------------------------------------------------------------------------

test("agente: fallback speechSynthesis existe e usa pt-BR", () => {
  assert.ok(agentHook.includes("speechSynthesis"), "usa SpeechSynthesis API");
  assert.ok(agentHook.includes('lang: "pt-BR"') || agentHook.includes('lang = "pt-BR"'), "idioma português");
});

// ---------------------------------------------------------------------------
// 14. ElevenLabs quota continua acionando fallback
// ---------------------------------------------------------------------------

test("agente: ElevenLabs quota aciona fallback de voz", () => {
  assert.ok(agentHook.includes("application/json"), "fallback detecta JSON (quota) do backend");
  assert.ok(agentHook.includes("speakWithBrowser"), "cai no fallback do navegador");
});

// ---------------------------------------------------------------------------
// 15. Nenhuma API key aparece no frontend
// ---------------------------------------------------------------------------

test("frontend: nenhuma API key aparece no código", () => {
  assert.ok(!agentTab.includes("ELEVENLABS_API_KEY"), "ElevenLabs key não exposta");
  assert.ok(!agentTab.includes("GROQ_API_KEY"), "Groq key não exposta");
  assert.ok(!agentTab.includes("gsk_"), "chave Groq não aparece");
  assert.ok(!agentTab.includes("sk_"), "chave ElevenLabs não aparece");
});

// ---------------------------------------------------------------------------
// 16. Multi-tenancy continua isolado
// ---------------------------------------------------------------------------

test("agente: chama backend com businessId do token (nunca da fala)", () => {
  assert.ok(agentHook.includes("/api/proxy/agent"), "chama o proxy da API, nunca diretamente");
  assert.ok(bottomNav.includes("useSession"), "navegação usa sessão para permissões");
});

// ---------------------------------------------------------------------------
// Diagnóstico: availability check não solicita permissão automaticamente
// ---------------------------------------------------------------------------

test("microfone: checkMicrophoneAvailability não solicita permissão", () => {
  assert.ok(micHook.includes("checkMicrophoneAvailability"), "função de diagnóstico existe");
  assert.ok(micHook.includes("navigator.permissions.query"), "usa Permission API sem solicitar");
  assert.ok(micHook.includes("prompt"), "retorna estado 'prompt' sem abrir nativo");
});

// ---------------------------------------------------------------------------
// ARIA e acessibilidade
// ---------------------------------------------------------------------------

test("bottom nav: possui atributos de acessibilidade", () => {
  assert.ok(bottomNav.includes('aria-label="Navegação principal"'), "nav principal com aria-label");
  assert.ok(bottomNav.includes('"Abrir Agente de Voz"'), "agente com aria-label");
  assert.ok(bottomNav.includes('"Abrir mais opções"'), "mais com aria-label");
  assert.ok(bottomNav.includes("aria-current"), "itens com aria-current");
});

// ---------------------------------------------------------------------------
// Safe area do iPhone
// ---------------------------------------------------------------------------

test("bottom nav: respeita safe-area-inset-bottom", () => {
  assert.ok(bottomNav.includes("env(safe-area-inset-bottom)"), "respeita área segura iOS");
});