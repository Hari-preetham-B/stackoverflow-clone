import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { verifyPayment } from "../services/subscriptionService.js";

/**
 * Regression tests for the payment-verification replay defect.
 *
 * Before the fix, `POST /subscription/verify` accepted the same Razorpay proof
 * repeatedly: the HMAC only covers "orderId|paymentId", neither of which changes
 * after checkout, so a captured signature stayed valid forever. Each replay
 * minted a new invoice number, reset the renewal date, created another
 * notification and sent another confirmation email.
 *
 * These tests are fully offline. The Mongoose models and the mailer are injected
 * as fakes, so no MongoDB, Razorpay, SMTP or Twilio call is ever made, and no
 * .env file is read - a throwaway test secret is placed on process.env and used
 * to compute the fixture signatures.
 */

const TEST_SECRET = "test-only-razorpay-secret-not-a-real-credential";
const ORDER_ID = "order_TESTREPLAY001";
const PAYMENT_ID = "pay_TESTREPLAY001";

const sign = (orderId, paymentId) =>
  crypto.createHmac("sha256", TEST_SECRET).update(`${orderId}|${paymentId}`).digest("hex");

/** A stand-in for a Mongoose Payment document. */
const createFakePayment = (overrides = {}) => ({
  _id: "payment_1",
  plan: "bronze",
  amount: 99,
  currency: "INR",
  provider: "razorpay",
  orderId: ORDER_ID,
  paymentId: null,
  signature: null,
  status: "created",
  invoiceNumber: null,
  paidAt: null,
  billingDetails: { name: "Buyer", email: "buyer@example.com", phone: "", address: "" },
  saveCount: 0,
  async save() {
    this.saveCount += 1;
    return this;
  },
  ...overrides,
});

/** Injected models + mailer that record every interaction. */
const createDeps = (payment) => {
  const calls = { findOne: [], userUpdate: [], notifications: [], emails: [] };
  return {
    calls,
    deps: {
      Payment: {
        async findOne(filter) {
          calls.findOne.push(filter);
          return payment;
        },
      },
      User: {
        async findByIdAndUpdate(id, update) {
          calls.userUpdate.push({ id, update });
          return {};
        },
      },
      Notification: {
        async create(doc) {
          calls.notifications.push(doc);
          return doc;
        },
      },
      sendEmail: async (options) => {
        calls.emails.push(options);
        return {};
      },
    },
  };
};

const makeUser = () => ({ _id: "user_1", email: "buyer@example.com" });

let originalSecret;

beforeEach(() => {
  originalSecret = process.env.RAZORPAY_KEY_SECRET;
  process.env.RAZORPAY_KEY_SECRET = TEST_SECRET;
});

afterEach(() => {
  if (originalSecret === undefined) delete process.env.RAZORPAY_KEY_SECRET;
  else process.env.RAZORPAY_KEY_SECRET = originalSecret;
});

// ---------------------------------------------------------------------------
// 1 + 6. A legitimate first verification still succeeds
// ---------------------------------------------------------------------------

test("1: first verification succeeds and activates the subscription", async () => {
  const payment = createFakePayment();
  const { calls, deps } = createDeps(payment);

  const result = await verifyPayment(
    { user: makeUser(), orderId: ORDER_ID, paymentId: PAYMENT_ID, signature: sign(ORDER_ID, PAYMENT_ID) },
    deps,
  );

  assert.equal(payment.status, "paid");
  assert.equal(payment.paymentId, PAYMENT_ID);
  assert.ok(payment.invoiceNumber, "an invoice number must be assigned");
  assert.match(payment.invoiceNumber, /^INV-\d{4}-[0-9A-F]{10}$/);
  assert.ok(payment.paidAt instanceof Date);
  assert.equal(payment.saveCount, 1, "payment must be saved exactly once");

  assert.equal(calls.userUpdate.length, 1, "subscription must be activated exactly once");
  const update = calls.userUpdate[0].update;
  assert.equal(update.subscriptionPlan, "bronze");
  assert.equal(update.subscriptionStatus, "active");
  assert.ok(update.subscriptionRenewalDate instanceof Date);

  assert.equal(calls.notifications.length, 1, "exactly one notification");
  assert.equal(calls.notifications[0].type, "payment");

  assert.equal(calls.emails.length, 1, "exactly one confirmation email");
  assert.equal(calls.emails[0].to, "buyer@example.com");
  assert.ok(calls.emails[0].subject.includes(payment.invoiceNumber));

  assert.equal(result.payment, payment);
  assert.ok(result.renewal instanceof Date);
});

test("6: the replay guard did not break the original success path", async () => {
  const payment = createFakePayment();
  const { deps } = createDeps(payment);

  await verifyPayment(
    { user: makeUser(), orderId: ORDER_ID, paymentId: PAYMENT_ID, signature: sign(ORDER_ID, PAYMENT_ID) },
    deps,
  );

  assert.equal(payment.status, "paid");
  assert.ok(payment.invoiceNumber);
});

// ---------------------------------------------------------------------------
// 2. Replaying the identical proof must be rejected with no side effects
// ---------------------------------------------------------------------------

test("2: replaying the same proof is rejected and changes nothing", async () => {
  const payment = createFakePayment();
  const { calls, deps } = createDeps(payment);
  const proof = { user: makeUser(), orderId: ORDER_ID, paymentId: PAYMENT_ID, signature: sign(ORDER_ID, PAYMENT_ID) };

  await verifyPayment(proof, deps);

  const invoiceAfterFirst = payment.invoiceNumber;
  const renewalAfterFirst = calls.userUpdate[0].update.subscriptionRenewalDate.getTime();
  const notificationsAfterFirst = calls.notifications.length;
  const emailsAfterFirst = calls.emails.length;
  const savesAfterFirst = payment.saveCount;

  await assert.rejects(
    () => verifyPayment(proof, deps),
    (error) => {
      assert.equal(error.message, "Payment already verified");
      return true;
    },
  );

  assert.equal(payment.invoiceNumber, invoiceAfterFirst, "invoice number must not change");
  assert.equal(calls.userUpdate.length, 1, "renewal date must not be reset");
  assert.equal(calls.userUpdate[0].update.subscriptionRenewalDate.getTime(), renewalAfterFirst);
  assert.equal(calls.notifications.length, notificationsAfterFirst, "no extra notification");
  assert.equal(calls.emails.length, emailsAfterFirst, "no extra confirmation email");
  assert.equal(payment.saveCount, savesAfterFirst, "payment must not be re-saved");
});

test("2b: repeated replays stay rejected indefinitely", async () => {
  const payment = createFakePayment();
  const { calls, deps } = createDeps(payment);
  const proof = { user: makeUser(), orderId: ORDER_ID, paymentId: PAYMENT_ID, signature: sign(ORDER_ID, PAYMENT_ID) };

  await verifyPayment(proof, deps);
  const invoice = payment.invoiceNumber;

  for (let i = 0; i < 5; i++) {
    await assert.rejects(() => verifyPayment(proof, deps), /Payment already verified/);
  }

  assert.equal(payment.invoiceNumber, invoice, "invoice stays the single original one");
  assert.equal(calls.notifications.length, 1);
  assert.equal(calls.emails.length, 1);
  assert.equal(calls.userUpdate.length, 1);
});

// ---------------------------------------------------------------------------
// 3. A payment that is already paid is rejected before the HMAC path
// ---------------------------------------------------------------------------

test("3: an already-paid payment is rejected before the HMAC success path", async () => {
  const payment = createFakePayment({ status: "paid", invoiceNumber: "INV-2026-EXISTING1", paymentId: "pay_prev" });
  const { calls, deps } = createDeps(payment);

  await assert.rejects(
    () =>
      verifyPayment(
        { user: makeUser(), orderId: ORDER_ID, paymentId: PAYMENT_ID, signature: sign(ORDER_ID, PAYMENT_ID) },
        deps,
      ),
    (error) => {
      assert.equal(error.message, "Payment already verified");
      return true;
    },
  );

  assert.equal(payment.invoiceNumber, "INV-2026-EXISTING1", "existing invoice untouched");
  assert.equal(calls.userUpdate.length, 0);
  assert.equal(calls.notifications.length, 0);
  assert.equal(calls.emails.length, 0);
  assert.equal(payment.saveCount, 0);
});

test("3b: the guard runs before signature validation", async () => {
  // A paid payment must report "already verified" even for a bogus signature,
  // proving the guard is positioned ahead of the HMAC comparison.
  const payment = createFakePayment({ status: "paid" });
  const { deps } = createDeps(payment);

  await assert.rejects(
    () =>
      verifyPayment(
        { user: makeUser(), orderId: ORDER_ID, paymentId: PAYMENT_ID, signature: "completely-wrong" },
        deps,
      ),
    /Payment already verified/,
  );
});

// ---------------------------------------------------------------------------
// 4. Unknown order keeps its original error
// ---------------------------------------------------------------------------

test("4: an unknown order still reports 'Payment order not found'", async () => {
  const { calls, deps } = createDeps(null);

  await assert.rejects(
    () =>
      verifyPayment(
        { user: makeUser(), orderId: "order_does_not_exist", paymentId: PAYMENT_ID, signature: "irrelevant" },
        deps,
      ),
    (error) => {
      assert.equal(error.message, "Payment order not found");
      return true;
    },
  );

  assert.equal(calls.findOne.length, 1);
  assert.equal(calls.userUpdate.length, 0);
  assert.equal(calls.notifications.length, 0);
  assert.equal(calls.emails.length, 0);
});

test("4b: the lookup stays scoped to the requesting user", async () => {
  const payment = createFakePayment();
  const { calls, deps } = createDeps(payment);

  await verifyPayment(
    { user: makeUser(), orderId: ORDER_ID, paymentId: PAYMENT_ID, signature: sign(ORDER_ID, PAYMENT_ID) },
    deps,
  );

  assert.deepEqual(calls.findOne[0], { orderId: ORDER_ID, userId: "user_1" });
});

// ---------------------------------------------------------------------------
// 5. An invalid signature is still rejected, leaving the payment untouched
// ---------------------------------------------------------------------------

test("5: an invalid signature is rejected with no side effects", async () => {
  const payment = createFakePayment();
  const { calls, deps } = createDeps(payment);

  await assert.rejects(
    () =>
      verifyPayment(
        { user: makeUser(), orderId: ORDER_ID, paymentId: PAYMENT_ID, signature: "not-a-valid-signature" },
        deps,
      ),
    (error) => {
      assert.equal(error.message, "Invalid payment signature");
      return true;
    },
  );

  assert.equal(payment.status, "created", "payment must remain unpaid");
  assert.equal(payment.invoiceNumber, null, "no invoice assigned");
  assert.equal(payment.paymentId, null);
  assert.equal(payment.saveCount, 0, "payment must not be saved");
  assert.equal(calls.userUpdate.length, 0);
  assert.equal(calls.notifications.length, 0);
  assert.equal(calls.emails.length, 0);
});

test("5b: a signature for a different paymentId is rejected", async () => {
  const payment = createFakePayment();
  const { calls, deps } = createDeps(payment);

  await assert.rejects(
    () =>
      verifyPayment(
        {
          user: makeUser(),
          orderId: ORDER_ID,
          paymentId: PAYMENT_ID,
          signature: sign(ORDER_ID, "pay_SOMETHINGELSE"),
        },
        deps,
      ),
    /Invalid payment signature/,
  );

  assert.equal(payment.status, "created");
  assert.equal(calls.emails.length, 0);
});

test("5c: HMAC verification is not weakened - a wrong secret fails", async () => {
  const payment = createFakePayment();
  const { deps } = createDeps(payment);
  const forged = crypto.createHmac("sha256", "attacker-guess").update(`${ORDER_ID}|${PAYMENT_ID}`).digest("hex");

  await assert.rejects(
    () => verifyPayment({ user: makeUser(), orderId: ORDER_ID, paymentId: PAYMENT_ID, signature: forged }, deps),
    /Invalid payment signature/,
  );

  assert.equal(payment.status, "created");
  assert.equal(payment.invoiceNumber, null);
});