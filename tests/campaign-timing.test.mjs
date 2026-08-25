/**
 * TIMING DE CAMPANHA — 1º lead imediato ao iniciar, próximos a cada
 * interval_seconds (padrão 2h).
 *
 * Verifica: (1) o primeiro pump é enfileirado SEM delay (envio imediato),
 * (2) start/resume limpam o countdown velho de "próximo envio",
 * (3) o pump despacha o primeiro lead e agenda o próximo só depois do envio.
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

const api = read("apps/api/src/routes/campaigns.ts");
const worker = read("apps/worker/src/jobs/campaign.processor.ts");

test("timing: primeiro pump ao iniciar é enfileirado SEM delay (1º lead imediato)", () => {
  const schedulePump = api.slice(api.indexOf("async function schedulePump"));
  const addBlock = schedulePump.slice(schedulePump.indexOf("CAMPAIGN_PROCESSING"));
  assert.ok(
    !/delay\s*:/.test(addBlock),
    "schedulePump não deve ter delay no primeiro pump",
  );
  assert.match(schedulePump, /jobId: `pump-\$\{campaignId\}-\$\{runId\}`/);
});

test("timing: start e resume limpam o countdown velho (não mostra 2h antes do 1º envio)", () => {
  assert.match(api, /redisClient\.del\(NEXT_SEND_KEY\(id\)\)/);
  const startBlock = api.slice(api.indexOf("/:id/start"), api.indexOf("/:id/pause"));
  assert.match(startBlock, /redisClient\.del\(NEXT_SEND_KEY\(id\)\)/);
  const resumeBlock = api.slice(api.indexOf("/:id/resume"), api.indexOf("/:id/finish"));
  assert.match(resumeBlock, /redisClient\.del\(NEXT_SEND_KEY\(id\)\)/);
});

test("timing: worker despacha o 1º lead e agenda o próximo para interval_seconds depois", () => {
  assert.match(worker, /if \(dispatched >= 1\) break;/);
  assert.match(worker, /nextAt = Date\.now\(\) \+ campaign\.interval_seconds \* 1000/);
  assert.match(worker, /scheduleNextPump\(campaignId, businessId, runId, campaign\.interval_seconds\)/);
  assert.match(worker, /delay: intervalSeconds \* 1000/);
});

test("timing: sem envio no ciclo, o countdown de próximo envio é limpo", () => {
  assert.match(worker, /redis\.del\(NEXT_SEND_KEY\(campaignId\)\)/);
  assert.match(worker, /if \(dispatched > 0\)/);
});
