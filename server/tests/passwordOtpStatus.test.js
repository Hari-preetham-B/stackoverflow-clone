import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import { verifyStoredOtp, hashOtp } from "../services/otpService.js";
import User from "../models/auth.js";
import Otp from "../models/otp.js";
import PasswordReset from "../models/passwordReset.js";
import Session from "../models/session.js";

/**
 * Regression coverage for the password-reset OTP status-code defect.
 *
 * `verifyStoredOtp` rejects an unknown, already-consumed, expired or over-attempted
 * OTP with a fixed message. The controller's catch only mapped
 * /expired|Invalid OTP|Maximum OTP/ to 400, so the remaining branches - above all
 * "OTP not found", which is what an unknown OR already-consumed OTP produces -
 * fell through to HTTP 500 and reported a client error as a server fault. This
 * was reproduced live against the running app before the fix:
 *
 *   POST /password/verify-otp  ->  HTTP 500  "OTP not found"
 *
 * These tests are fully offline. The Mongoose models are replaced with fakes and
 * restored afterwards, so no database connection is opened and no SMTP or Twilio
 * call is made. Two deliberate choices keep them hermetic:
 *
 *  - `NODE_ENV` / `TWILIO_VERIFY_SERVICE_SID` are pinned here, because the
 *    controller picks its OTP channel by reading them and the value in .env
 *    would otherwise decide which branch runs.
 *  - the subject user is phone-only, and the success path only mails a new
 *    password when `user.email` is set, so nothing is delivered anywhere.
 */

const ORIGINAL_ENV = { NODE_ENV: process.env.NODE_ENV, TWILIO_VERIFY_SERVICE_SID: process.env.TWILIO_VERIFY_SERVICE_SID };
process.env.NODE_ENV = "test";
process.env.TWILIO_VERIFY_SERVICE_SID = "";
after(() => {
  if (ORIGINAL_ENV.NODE_ENV === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = ORIGINAL_ENV.NODE_ENV;
  if (ORIGINAL_ENV.TWILIO_VERIFY_SERVICE_SID === undefined) delete process.env.TWILIO_VERIFY_SERVICE_SID;
  else process.env.TWILIO_VERIFY_SERVICE_SID = ORIGINAL_ENV.TWILIO_VERIFY_SERVICE_SID;
});

const OTP = "481902";

/** Mongoose query double: awaitable, and chainable through .sort(). */
const asQuery = (value) => {
  const query = { then: (onOk, onErr) => Promise.resolve(value).then(onOk, onErr), sort: () => query };
  return query;
};

/** A stand-in for an Otp document, with the real shape verifyStoredOtp reads. */
const createOtpDoc = (overrides = {}) => ({
  _id: "otp_1",
  verified: false,
  expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  attempts: 0,
  maxAttempts: 5,
  otpHash: null,
  saves: 0,
  async save() { this.saves += 1; return this; },
  ...overrides,
});

const createUser = (overrides = {}) => ({
  _id: "user_1",
  name: "OTP Subject",
  email: null,
  phone: "+15550199",
  password: "$2b$12$pre-existing-hash-placeholder",
  saves: 0,
  async save() { this.saves += 1; return this; },
  ...overrides,
});

const createRes = () => {
  // Express defaults a bare res.json() to 200, which is what the success path
  // relies on, so the double reproduces that rather than reporting "no status".
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.body = payload; return res; };
  return res;
};

/**
 * Invoke the real controller with stubbed models.
 * @returns {Promise<{res: object, user: object, revoked: object[]}>}
 */
const callVerify = async ({ otpDoc, user = createUser(), identifier = "+15550199", otp = OTP } = {}) => {
  const original = {
    userFindOne: User.findOne, otpFindOne: Otp.findOne,
    resetFindOne: PasswordReset.findOne, sessionUpdateMany: Session.updateMany,
  };
  const revoked = [];
  // `findUser` probes the email first and the phone second, so the stub answers both.
  User.findOne = async (filter) => (filter.email ? null : user);
  Otp.findOne = () => asQuery(otpDoc);
  PasswordReset.findOne = () => asQuery(null);
  Session.updateMany = async (filter, update) => { revoked.push({ filter, update }); return { modifiedCount: 1 }; };

  try {
    const { verifyPasswordResetOtp } = await import("../controller/password.js");
    const res = createRes();
    await verifyPasswordResetOtp({ body: { identifier, otp } }, res);
    return { res, user, revoked, otpDoc };
  } finally {
    User.findOne = original.userFindOne; Otp.findOne = original.otpFindOne;
    PasswordReset.findOne = original.resetFindOne; Session.updateMany = original.sessionUpdateMany;
  }
};

const validDoc = async (overrides = {}) => createOtpDoc({ otpHash: await hashOtp(OTP), ...overrides });

describe("password reset OTP: unknown and consumed codes are bad requests, not server faults", () => {
  test("1. unknown OTP -> 400", async () => {
    const { res } = await callVerify({ otpDoc: null });
    assert.equal(res.statusCode, 400, "an unknown OTP must not be reported as a server error");
    assert.equal(res.body.message, "OTP not found");
  });

  test("2. already-consumed OTP -> 400", async () => {
    // The controller queries only `verified: false`, so a consumed code reaches
    // verifyStoredOtp as "no document" - the same branch as case 1.
    const { res } = await callVerify({ otpDoc: null });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, "OTP not found");

    // And when a consumed document is presented directly it is still rejected.
    const consumed = await validDoc({ verified: true });
    await assert.rejects(() => verifyStoredOtp(consumed, OTP), /OTP already used/);
  });

  test("3. expired OTP -> 400 (unchanged)", async () => {
    const doc = await validDoc({ expiresAt: new Date(Date.now() - 1000) });
    const { res } = await callVerify({ otpDoc: doc });
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /expired/i);
  });

  test("4. invalid OTP -> 400 (unchanged)", async () => {
    const doc = await validDoc();
    const { res } = await callVerify({ otpDoc: doc, otp: "000000" });
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /Invalid OTP/i);
    assert.equal(doc.attempts, 1, "a failed guess must still consume an attempt");
  });

  test("5. valid OTP -> success unchanged", async () => {
    const doc = await validDoc();
    const user = createUser();
    const { res, revoked } = await callVerify({ otpDoc: doc, user });

    assert.equal(res.statusCode, 200);
    assert.match(res.body.message, /new temporary password/i);
    assert.equal(doc.verified, true, "the OTP must still be marked consumed");
    assert.equal(user.saves, 1, "the new password must still be persisted");
    assert.match(user.password, /^\$2[aby]\$/, "the replacement password must still be bcrypt-hashed");
    assert.notEqual(user.password, "$2b$12$pre-existing-hash-placeholder");
    assert.equal(revoked.length, 1, "active sessions must still be revoked on reset");
    assert.deepEqual(revoked[0].filter, { userId: "user_1", isActive: true });
  });

  test("over-attempted OTP -> 400 (unchanged)", async () => {
    const doc = await validDoc({ attempts: 5 });
    const { res } = await callVerify({ otpDoc: doc });
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /Maximum OTP attempts exceeded/i);
  });

  test("no response ever leaks a credential or OTP material", async () => {
    const hash = await hashOtp(OTP);
    const docs = [null, await validDoc({ expiresAt: new Date(Date.now() - 1000) }), await validDoc()];
    for (const otpDoc of docs) {
      const { res, user } = await callVerify({ otpDoc });
      const payload = JSON.stringify(res.body);
      assert.ok(!payload.includes(OTP), "the submitted OTP must not be echoed back");
      assert.ok(!payload.includes(hash), "the stored OTP hash must never be returned");
      assert.ok(!payload.includes(String(user.password)), "no password value may appear in the response");
      assert.ok(!/"password"\s*:/.test(payload), "the response must not contain a password field");
      assert.ok(!/otpHash/i.test(payload), "the response must not contain OTP material");
    }
  });

  test("an unexpected internal failure is still reported as 500", async () => {
    // Guards the fix from over-correcting into "never 500". Both models are
    // stubbed: an unstubbed find would instead sit in Mongoose's 10s buffer
    // timeout and this would pass for entirely the wrong reason.
    const original = { userFindOne: User.findOne, otpFindOne: Otp.findOne };
    const user = createUser();
    User.findOne = async (filter) => (filter.email ? null : user);
    Otp.findOne = () => { throw new Error("connection to replica set lost"); };
    try {
      const { verifyPasswordResetOtp } = await import("../controller/password.js");
      const res = createRes();
      await verifyPasswordResetOtp({ body: { identifier: "+15550199", otp: OTP } }, res);
      assert.equal(res.statusCode, 500, "a genuine server fault must remain a 500");
      assert.equal(res.body.message, "connection to replica set lost");
    } finally {
      User.findOne = original.userFindOne; Otp.findOne = original.otpFindOne;
    }
  });
});

describe("otpService.verifyStoredOtp contract (unchanged)", () => {
  test("rejects a missing document", async () => {
    await assert.rejects(() => verifyStoredOtp(null, OTP), /OTP not found/);
  });

  test("rejects a consumed document", async () => {
    const consumed = await validDoc({ verified: true });
    await assert.rejects(() => verifyStoredOtp(consumed, OTP), /OTP already used/);
  });

  test("rejects an expired document without touching attempts", async () => {
    const doc = await validDoc({ expiresAt: new Date(Date.now() - 1) });
    await assert.rejects(() => verifyStoredOtp(doc, OTP), /expired/i);
    assert.equal(doc.attempts, 0);
  });

  test("counts a wrong guess and reports the remaining budget", async () => {
    const doc = await validDoc();
    await assert.rejects(() => verifyStoredOtp(doc, "111111"), /4 attempts remaining/);
    assert.equal(doc.attempts, 1);
  });

  test("accepts the correct code exactly once", async () => {
    const doc = await validDoc();
    assert.equal(await verifyStoredOtp(doc, OTP), true);
    assert.equal(doc.verified, true);
    await assert.rejects(() => verifyStoredOtp(doc, OTP), /OTP already used/);
  });
});
