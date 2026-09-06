import { test } from "node:test";
import assert from "node:assert/strict";

const { VAD_CONFIG, NOISE_ONLY_PATTERN, isValidUserUtterance } =
  await import("../apps/dashboard/components/agent/engine-utils.ts");

test("vad: VAD_CONFIG possui todas as propriedades calibradas exigidas", () => {
  assert.ok(
    VAD_CONFIG.minSpeechDurationMs >= 250 &&
      VAD_CONFIG.minSpeechDurationMs <= 400,
  );
  assert.ok(VAD_CONFIG.minSilenceDurationMs >= 1000);
  assert.ok(VAD_CONFIG.calibrationDurationMs >= 1000);
  assert.ok(VAD_CONFIG.minThreshold > 0);
  assert.ok(VAD_CONFIG.maxThreshold > VAD_CONFIG.minThreshold);
  assert.ok(
    VAD_CONFIG.speechStartMargin > VAD_CONFIG.speechStopMargin,
    "Histerese: start margin deve ser maior que stop margin",
  );
  assert.ok(
    VAD_CONFIG.voiceBandLowHz >= 100 && VAD_CONFIG.voiceBandLowHz <= 300,
  );
  assert.ok(
    VAD_CONFIG.voiceBandHighHz >= 3000 && VAD_CONFIG.voiceBandHighHz <= 4000,
  );
});

test("utterance: rejeita strings vazias, nulas, indefinidas ou apenas espaços", () => {
  assert.equal(isValidUserUtterance(""), false);
  assert.equal(isValidUserUtterance("   "), false);
  assert.equal(isValidUserUtterance(null), false);
  assert.equal(isValidUserUtterance(undefined), false);
});

test("utterance: rejeita pontuação isolada e ruídos puros", () => {
  assert.equal(isValidUserUtterance("."), false);
  assert.equal(isValidUserUtterance("..."), false);
  assert.equal(isValidUserUtterance("!?,"), false);
  assert.equal(isValidUserUtterance("- - -"), false);
  assert.equal(isValidUserUtterance("---"), false);
});

test("utterance: rejeita tags de ruído do Whisper ou áudio", () => {
  assert.equal(isValidUserUtterance("[ruído]"), false);
  assert.equal(isValidUserUtterance("[ruido]"), false);
  assert.equal(isValidUserUtterance("[música]"), false);
  assert.equal(isValidUserUtterance("[musica]"), false);
  assert.equal(isValidUserUtterance("[silêncio]"), false);
  assert.equal(isValidUserUtterance("(tosse)"), false);
  assert.equal(isValidUserUtterance("[palmas]"), false);
  assert.equal(isValidUserUtterance("[inaudível]"), false);
});

test("utterance: rejeita interjeições curtas não linguísticas isoladas", () => {
  assert.equal(isValidUserUtterance("uh"), false);
  assert.equal(isValidUserUtterance("ah"), false);
  assert.equal(isValidUserUtterance("hm"), false);
  assert.equal(isValidUserUtterance("humm"), false);
  assert.equal(isValidUserUtterance("um"), false);
  assert.equal(isValidUserUtterance("shh"), false);
});

test("utterance: rejeita alucinações comuns de silêncio/YouTube do Whisper", () => {
  assert.equal(isValidUserUtterance("Obrigado por assistir."), false);
  assert.equal(isValidUserUtterance("Inscreva-se no canal"), false);
  assert.equal(isValidUserUtterance("Legendas pela comunidade"), false);
});

test("utterance: aceita falas humanas válidas e saudações", () => {
  assert.equal(isValidUserUtterance("Olá SAVYRON"), true);
  assert.equal(isValidUserUtterance("oi"), true);
  assert.equal(isValidUserUtterance("sim"), true);
  assert.equal(isValidUserUtterance("não"), true);
  assert.equal(isValidUserUtterance("quanto faturamos esse mês?"), true);
  assert.equal(isValidUserUtterance("listar leads"), true);
  assert.equal(
    isValidUserUtterance("olá, você pode me ajudar com as propostas?"),
    true,
  );
});
