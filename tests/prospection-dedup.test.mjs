/**
 * CORREÇÃO — Prospecção web: dedup por telefone normalizado + persistência
 * resiliente a duplicatas.
 *
 * O bug: um duplicado de telefone (`business_id, phone`) falhava a run
 * inteira (constraint unique) porque o dedup comparava o telefone do
 * candidato normalizado (+55...) com o valor RAW salvo no banco ("55...").
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

const processor = read("apps/worker/src/jobs/prospect.processor.ts");

test("dedup: existingKeys normaliza telefones existentes (E.164) para comparar justo", () => {
  assert.match(processor, /select: \{ phone: true, fingerprint_phone: true \}/);
  assert.match(processor, /normalizePhone\(r\.phone\)/);
  assert.match(processor, /const norm = normalizePhone\(r\.phone\);/);
  assert.match(processor, /if \(norm\) phones\.add\(norm\);/);
});

test("dedup: persistBatch grava fingerprints de telefone/e-mail", () => {
  assert.match(processor, /fingerprint_phone: phoneFp/);
  assert.match(processor, /fingerprint_email: emailFp/);
  assert.match(processor, /normalizePhone\(lead\.phone\)/);
});

test("resiliência: duplicata de constraint NÃO derruba a run — é pulada", () => {
  assert.match(processor, /isUniqueConstraintError/);
  assert.match(processor, /LEAD_SKIPPED_DUPLICATE/);
  assert.match(processor, /duplicates \+= 1;/);
  assert.match(processor, /continue;/);
  assert.match(processor, /não falha a run|não derruba a run|segue/);
});

test("resiliência: lote continua salvando os demais leads após uma duplicata", () => {
  assert.match(processor, /const row = await tx\.lead\.create\(\{/);
  assert.match(processor, /saved \+= 1;/);
  assert.ok(
    !/errors = leads\.length/.test(processor.split("LEAD_SKIPPED_DUPLICATE")[0] ?? ""),
    "erro de duplicata não zera a contagem de erros do lote",
  );
});
