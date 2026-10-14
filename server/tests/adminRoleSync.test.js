import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { syncAdminRole } from "../services/adminRoleService.js";

/**
 * These tests exercise the admin-role synchronisation logic in isolation.
 *
 * They never connect to MongoDB: the Mongoose User model is replaced with a
 * simple fake that records every call. No SMTP, Twilio or Razorpay code is
 * reached, and no .env file is read - ADMIN_EMAIL is set directly on
 * process.env for the duration of each test.
 *
 * server/index.js is deliberately NOT imported anywhere in this file, because
 * importing it opens a live database connection and would run the real
 * backfill against the configured database.
 */

const FORBIDDEN_METHODS = [
  "insertMany",
  "insertOne",
  "create",
  "bulkWrite",
  "findOneAndUpdate",
  "findOneAndReplace",
  "replaceOne",
  "updateOne",
  "deleteOne",
  "deleteMany",
  "findOneAndDelete",
  "remove",
];

/** A fake User model that records every method call. */
const createFakeUserModel = ({ modifiedCount = 0, throwOnUpdate = false } = {}) => {
  const calls = { updateMany: [] };
  for (const name of FORBIDDEN_METHODS) calls[name] = [];

  const model = {
    calls,
    async updateMany(filter, update) {
      calls.updateMany.push({ filter, update });
      if (throwOnUpdate) throw new Error("Simulated database failure");
      return { modifiedCount };
    },
  };

  for (const name of FORBIDDEN_METHODS) {
    model[name] = async (...args) => {
      calls[name].push(args);
      return { acknowledged: true };
    };
  }

  return model;
};

/** Assert the fake model performed no operation other than updateMany. */
const assertNoForbiddenOperations = (model) => {
  for (const name of FORBIDDEN_METHODS) {
    assert.deepEqual(model.calls[name], [], `${name}() must never be called by syncAdminRole`);
  }
};

/** Capture console output so tests stay quiet and can assert on logging. */
const captureConsole = () => {
  const original = { log: console.log, error: console.error };
  const logs = [];
  const errors = [];
  console.log = (...args) => logs.push(args.join(" "));
  console.error = (...args) => errors.push(args.join(" "));
  return {
    logs,
    errors,
    restore() {
      console.log = original.log;
      console.error = original.error;
    },
  };
};

let originalAdminEmail;
let capture;

beforeEach(() => {
  originalAdminEmail = process.env.ADMIN_EMAIL;
  delete process.env.ADMIN_EMAIL;
  capture = captureConsole();
});

afterEach(() => {
  capture.restore();
  if (originalAdminEmail === undefined) delete process.env.ADMIN_EMAIL;
  else process.env.ADMIN_EMAIL = originalAdminEmail;
});

// ---------------------------------------------------------------------------
// A. ADMIN_EMAIL missing / empty -> returns without touching the model
// ---------------------------------------------------------------------------

test("A1: does nothing when ADMIN_EMAIL is unset", async () => {
  delete process.env.ADMIN_EMAIL;
  const model = createFakeUserModel();

  await syncAdminRole(model);

  assert.deepEqual(model.calls.updateMany, [], "model must not be called when ADMIN_EMAIL is unset");
  assertNoForbiddenOperations(model);
  assert.deepEqual(capture.logs, []);
  assert.deepEqual(capture.errors, []);
});

test("A2: does nothing when ADMIN_EMAIL is an empty string", async () => {
  process.env.ADMIN_EMAIL = "";
  const model = createFakeUserModel();

  await syncAdminRole(model);

  assert.deepEqual(model.calls.updateMany, []);
  assertNoForbiddenOperations(model);
});

test("A3: does nothing when ADMIN_EMAIL is only whitespace", async () => {
  process.env.ADMIN_EMAIL = "   \t  ";
  const model = createFakeUserModel();

  await syncAdminRole(model);

  assert.deepEqual(model.calls.updateMany, [], "whitespace-only ADMIN_EMAIL must be treated as empty");
  assertNoForbiddenOperations(model);
});

// ---------------------------------------------------------------------------
// B. ADMIN_EMAIL normalisation: trim() + toLowerCase()
// ---------------------------------------------------------------------------

test("B1: trims surrounding whitespace and lowercases the email", async () => {
  process.env.ADMIN_EMAIL = "  ADMIN@EXAMPLE.COM  ";
  const model = createFakeUserModel({ modifiedCount: 1 });

  await syncAdminRole(model);

  assert.equal(model.calls.updateMany.length, 1);
  assert.equal(model.calls.updateMany[0].filter.email, "admin@example.com");
});

test("B2: lowercases an already-trimmed email", async () => {
  process.env.ADMIN_EMAIL = "Admin@Example.Com";
  const model = createFakeUserModel({ modifiedCount: 1 });

  await syncAdminRole(model);

  assert.equal(model.calls.updateMany[0].filter.email, "admin@example.com");
});

// ---------------------------------------------------------------------------
// C. The query filter is exactly { email, role: { $ne: "admin" } }
// ---------------------------------------------------------------------------

test("C1: uses the exact expected filter", async () => {
  process.env.ADMIN_EMAIL = "admin@example.com";
  const model = createFakeUserModel({ modifiedCount: 1 });

  await syncAdminRole(model);

  assert.deepEqual(model.calls.updateMany[0].filter, {
    email: "admin@example.com",
    role: { $ne: "admin" },
  });
});

test("C2: filter excludes documents already holding role 'admin' (idempotency by construction)", async () => {
  process.env.ADMIN_EMAIL = "admin@example.com";
  const model = createFakeUserModel({ modifiedCount: 0 });

  await syncAdminRole(model);

  const { filter } = model.calls.updateMany[0];
  assert.equal(filter.role.$ne, "admin", "documents already admin must not match the filter");
});

// ---------------------------------------------------------------------------
// D. The update is exactly { $set: { role: "admin" } }
// ---------------------------------------------------------------------------

test("D1: uses the exact expected update document", async () => {
  process.env.ADMIN_EMAIL = "admin@example.com";
  const model = createFakeUserModel({ modifiedCount: 1 });

  await syncAdminRole(model);

  assert.deepEqual(model.calls.updateMany[0].update, {
    $set: { role: "admin" },
  });
});

test("D2: update sets only the role field and never touches credentials", async () => {
  process.env.ADMIN_EMAIL = "admin@example.com";
  const model = createFakeUserModel({ modifiedCount: 1 });

  await syncAdminRole(model);

  const { update } = model.calls.updateMany[0];
  assert.deepEqual(Object.keys(update), ["$set"]);
  assert.deepEqual(Object.keys(update.$set), ["role"]);
});

// ---------------------------------------------------------------------------
// E. Idempotency: modifiedCount 0 -> no logging, no extra writes
// ---------------------------------------------------------------------------

test("E1: modifiedCount 0 produces no sync log line", async () => {
  process.env.ADMIN_EMAIL = "admin@example.com";
  const model = createFakeUserModel({ modifiedCount: 0 });

  await syncAdminRole(model);

  assert.deepEqual(capture.logs, [], "nothing changed, so nothing should be logged");
  assert.deepEqual(capture.errors, []);
});

test("E2: a second sync performs no insert, upsert, replace or delete", async () => {
  process.env.ADMIN_EMAIL = "admin@example.com";
  const model = createFakeUserModel({ modifiedCount: 0 });

  await syncAdminRole(model);

  assertNoForbiddenOperations(model);
  assert.equal(model.calls.updateMany.length, 1, "exactly one updateMany and nothing else");
});

// ---------------------------------------------------------------------------
// F. Successful update: modifiedCount 1 -> called once, logged once
// ---------------------------------------------------------------------------

test("F1: logs when a document was modified", async () => {
  process.env.ADMIN_EMAIL = "admin@example.com";
  const model = createFakeUserModel({ modifiedCount: 1 });

  await syncAdminRole(model);

  assert.equal(
    capture.logs[0],
    "Admin role synced for the configured ADMIN_EMAIL (1 document)",
  );
});

test("F2: calls updateMany exactly once on success", async () => {
  process.env.ADMIN_EMAIL = "admin@example.com";
  const model = createFakeUserModel({ modifiedCount: 1 });

  await syncAdminRole(model);

  assert.equal(model.calls.updateMany.length, 1);
  assertNoForbiddenOperations(model);
});

// ---------------------------------------------------------------------------
// G. Error handling: a failing model must not reject or crash startup
// ---------------------------------------------------------------------------

test("G1: swallows a model error and logs it instead of throwing", async () => {
  process.env.ADMIN_EMAIL = "admin@example.com";
  const model = createFakeUserModel({ throwOnUpdate: true });

  await assert.doesNotReject(() => syncAdminRole(model), "syncAdminRole must not reject on database failure");

  assert.deepEqual(capture.errors, ["Admin role sync skipped: Simulated database failure"]);
  assert.deepEqual(capture.logs, []);
});

test("G2: still performs no destructive operation when the update fails", async () => {
  process.env.ADMIN_EMAIL = "admin@example.com";
  const model = createFakeUserModel({ throwOnUpdate: true });

  await syncAdminRole(model);

  assertNoForbiddenOperations(model);
});