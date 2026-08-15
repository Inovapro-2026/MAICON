import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizePlatformRole,
  normalizeBusinessRole,
  normalizeBusinessStatus,
  validateSelfRoleChange,
  validatePlatformRoleChange,
} from "@prospector/utils";

test("normaliza papéis de plataforma", () => {
  assert.equal(normalizePlatformRole("PLATFORM_ADMIN"), "PLATFORM_ADMIN");
  assert.equal(normalizePlatformRole("PLATFORM_STAFF"), "PLATFORM_STAFF");
  assert.equal(normalizePlatformRole("NONE"), "NONE");
  assert.equal(normalizePlatformRole("SUPER_ADMIN"), null);
  assert.equal(normalizePlatformRole(undefined), null);
  assert.equal(normalizePlatformRole(""), null);
});

test("normaliza papéis de empresa e status", () => {
  assert.equal(normalizeBusinessRole("OWNER"), "OWNER");
  assert.equal(normalizeBusinessRole("AGENT"), "AGENT");
  assert.equal(normalizeBusinessRole("boss"), null);
  assert.equal(normalizeBusinessStatus("SUSPENDED"), "SUSPENDED");
  assert.equal(normalizeBusinessStatus("PENDING_PAYMENT"), "PENDING_PAYMENT");
  assert.equal(normalizeBusinessStatus("BROKEN"), null);
});

test("anti-lockout: último admin não pode se rebaixar", () => {
  const err = validateSelfRoleChange({
    actorId: "a",
    targetId: "a",
    isLastPlatformAdmin: true,
    isSelf: true,
    newRole: "NONE",
  });
  assert.ok(err, "deve bloquear o último admin de se rebaixar");
});

test("anti-lockout: se houver outro admin, pode se rebaixar", () => {
  const err = validateSelfRoleChange({
    actorId: "a",
    targetId: "a",
    isLastPlatformAdmin: false,
    isSelf: true,
    newRole: "PLATFORM_STAFF",
  });
  assert.equal(err, null);
});

test("anti-lockout: último admin não pode se desativar", () => {
  const err = validateSelfRoleChange({
    actorId: "a",
    targetId: "a",
    isLastPlatformAdmin: true,
    isSelf: true,
    newRole: "PLATFORM_ADMIN",
    disabling: true,
  });
  assert.ok(err);
});

test("admin não pode mexer na própria role se for o último", () => {
  const err = validatePlatformRoleChange({
    actorRole: "PLATFORM_ADMIN",
    targetId: "a",
    actorId: "a",
    platformAdminCount: 1,
    targetIsPlatformAdmin: true,
    newRole: "NONE",
  });
  assert.ok(err, "bloqueia quando count=1");
});

test("rebaixamento do próprio admin permitido com outro admin", () => {
  const err = validatePlatformRoleChange({
    actorRole: "PLATFORM_ADMIN",
    targetId: "a",
    actorId: "a",
    platformAdminCount: 2,
    targetIsPlatformAdmin: true,
    newRole: "PLATFORM_STAFF",
  });
  assert.equal(err, null);
});

test("apenas PLATFORM_ADMIN altera papéis", () => {
  const err = validatePlatformRoleChange({
    actorRole: "PLATFORM_STAFF",
    targetId: "b",
    actorId: "a",
    platformAdminCount: 1,
    targetIsPlatformAdmin: true,
    newRole: "NONE",
  });
  assert.ok(err);
});

test("rebaixar outro admin não é bloqueado pelo anti-lockout", () => {
  const err = validatePlatformRoleChange({
    actorRole: "PLATFORM_ADMIN",
    targetId: "b",
    actorId: "a",
    platformAdminCount: 1,
    targetIsPlatformAdmin: true,
    newRole: "NONE",
  });
  assert.equal(
    err,
    null,
    "rebaixar outra pessoa é permitido mesmo sendo o único admin",
  );
});
