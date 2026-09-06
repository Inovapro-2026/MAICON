/**
 * TESTES: máquina de estados visual do Agente (V1/V2 compartilhada).
 *
 * Garantem:
 * 1. O conjunto de estados (8 de voz / 6 MAICON) e seus validadores.
 * 2. O mapeamento exato de estado real do agente → núcleo MAICON.
 * 3. Transições permitidas entre estados (idle é a única saída de error).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

const {
  VOICE_STATES,
  SAVYRON_STATES,
  isVoiceState,
  isSavyronState,
  mapVoiceStateToSavyron,
  isAllowedVoiceTransition,
  isAllowedSavyronTransition,
  isErroneousTransition,
} = await import("../apps/dashboard/components/agent/agent-visual-state.ts");

// ---------------------------------------------------------------------------
// Conjunto de estados e validadores
// ---------------------------------------------------------------------------

test("core: VoiceState contém exatamente 8 estados (incl. agent-thinking)", () => {
  assert.deepEqual([...VOICE_STATES], [
    "idle",
    "connecting",
    "listening",
    "user-speaking",
    "agent-thinking",
    "processing",
    "agent-speaking",
    "error",
  ]);
});

test("core: SavyronState contém exatamente 6 estados (incl. error)", () => {
  assert.deepEqual([...SAVYRON_STATES], [
    "idle",
    "thinking",
    "listening",
    "speaking",
    "processing",
    "error",
  ]);
});

test("core: isVoiceState aceita estados válidos e rejeita inválidos", () => {
  for (const s of VOICE_STATES) assert.ok(isVoiceState(s), s);
  assert.ok(!isVoiceState("falando"));
  assert.ok(!isVoiceState(""));
  assert.ok(!isVoiceState(42));
  assert.ok(!isVoiceState(null));
  assert.ok(!isVoiceState({}));
});

test("core: isSavyronState aceita estados válidos e rejeita inválidos", () => {
  for (const s of SAVYRON_STATES) assert.ok(isSavyronState(s), s);
  assert.ok(!isSavyronState("whatever"));
  assert.ok(!isSavyronState(undefined));
});

// ---------------------------------------------------------------------------
// Mapeamento estado real do agente → núcleo MAICON
// ---------------------------------------------------------------------------

test("map: estado real → núcleo MAICON segue a tabela exata", () => {
  const expected = {
    idle: "idle",
    connecting: "thinking",
    listening: "listening",
    "user-speaking": "listening",
    "agent-thinking": "thinking",
    processing: "processing",
    "agent-speaking": "speaking",
    error: "error",
  };
  for (const [voice, savyron] of Object.entries(expected)) {
    assert.equal(mapVoiceStateToSavyron(voice), savyron, voice);
  }
});

test("map: estado desconhecido cai no default 'idle' (nunca inventa)", () => {
  assert.equal(mapVoiceStateToSavyron("não-existe"), "idle");
});

test("map: todo estado de voz mapeia para um estado MAICON válido", () => {
  for (const s of VOICE_STATES) {
    const mapped = mapVoiceStateToSavyron(s);
    assert.ok(isSavyronState(mapped), `${s} → ${mapped}`);
  }
});

// ---------------------------------------------------------------------------
// Transições do estado interno do agente
// ---------------------------------------------------------------------------

test("transitions: ciclo completo idle→…→agente é permitido passo a passo", () => {
  const chain = [
    "idle",
    "connecting",
    "listening",
    "user-speaking",
    "processing",
    "agent-thinking",
    "agent-speaking",
    "listening",
    "idle",
  ];
  for (let i = 0; i < chain.length - 1; i++) {
    assert.ok(
      isAllowedVoiceTransition(chain[i], chain[i + 1]),
      `${chain[i]} → ${chain[i + 1]} deve ser permitido`,
    );
  }
});

test("transitions: saltos inválidos entre estados de voz são rejeitados", () => {
  assert.ok(!isAllowedVoiceTransition("idle", "agent-speaking"));
  assert.ok(!isAllowedVoiceTransition("idle", "processing"));
  assert.ok(!isAllowedVoiceTransition("agent-speaking", "user-speaking"));
  assert.ok(!isAllowedVoiceTransition("agent-thinking", "user-speaking"));
  assert.ok(!isAllowedVoiceTransition("error", "agent-speaking"));
});

test("transitions: error → idle é a única saída da máquina MAICON", () => {
  assert.ok(isAllowedSavyronTransition("error", "idle"));
  for (const s of SAVYRON_STATES) {
    if (s === "idle") continue;
    assert.ok(!isAllowedSavyronTransition("error", s), `error → ${s} deve ser bloqueado`);
  }
});

test("transitions: isErroneousTransition sinaliza saída ilegal de error", () => {
  assert.ok(isErroneousTransition("error", "thinking"));
  assert.ok(isErroneousTransition("error", "speaking"));
  assert.ok(isErroneousTransition("error", "processing"));
  assert.ok(!isErroneousTransition("error", "idle"), "error → idle é a recuperação correta");
  assert.ok(!isErroneousTransition("speaking", "idle"));
});

test("transitions: estado MAICON não transiciona para si mesmo", () => {
  for (const s of SAVYRON_STATES) {
    assert.ok(!isAllowedSavyronTransition(s, s), `${s} → ${s} deve ser rejeitado`);
  }
});

test("transitions: todo estado MAICON pode partir de idle", () => {
  for (const s of SAVYRON_STATES) {
    if (s === "idle") continue;
    assert.ok(isAllowedSavyronTransition("idle", s), `idle → ${s} deve ser permitido`);
  }
});

// ---------------------------------------------------------------------------
// Recuperação de erro (núcleo MAICON)
// ---------------------------------------------------------------------------

test("recovery: estado real 'error' mapeia p/ MAICON e pode voltar a idle", () => {
  const mapped = mapVoiceStateToSavyron("error");
  assert.equal(mapped, "error");
  assert.ok(isAllowedSavyronTransition(mapped, "idle"));
  assert.ok(!isErroneousTransition("error", "idle"));
});

test("recovery: sessão nova após erro parte de idle, nunca direto em speaking", () => {
  const restart = ["connecting", "listening"];
  const mappedRoot = mapVoiceStateToSavyron("idle");
  for (const s of restart) {
    assert.ok(
      isAllowedSavyronTransition(mappedRoot, mapVoiceStateToSavyron(s)),
      `${mappedRoot} → ${mapVoiceStateToSavyron(s)}`,
    );
  }
  assert.equal(mapVoiceStateToSavyron("connecting"), "thinking");
  assert.equal(mapVoiceStateToSavyron("listening"), "listening");
});