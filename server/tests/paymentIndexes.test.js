import { test, describe } from "node:test";
import assert from "node:assert/strict";

/**
 * Regression tests for the Payment uniqueness indexes.
 *
 * Bug: `paymentId` was declared as `unique: true, sparse: true` together with
 * `default: null`. MongoDB's `sparse` option only excludes documents where the
 * field is entirely ABSENT. Because the schema default writes an explicit
 * `null`, every pending order stored `paymentId: null`, the sparse index still
 * indexed it, and creating a second subscription order failed with
 * E11000 (duplicate key, index paymentId_1, dup key { paymentId: null }).
 *
 * Fix: a partial unique index scoped to `{ paymentId: { $type: "string" } }`,
 * which excludes null/absent values from the index while keeping uniqueness for
 * real Razorpay payment ids.
 *
 * These tests are dependency-free and do not touch MongoDB. They verify the
 * schema index DEFINITION that Mongoose compiles, plus a faithful in-memory
 * model of the partial-index matching semantics that MongoDB applies, so the
 * behaviour is pinned without requiring a live database.
 */

const { default: Payment } = await import("../models/payment.js");

// ---------------------------------------------------------------------------
// Index definition
// ---------------------------------------------------------------------------

describe("Payment index definition", () => {
  // The partial index is declared at SCHEMA level: Mongoose silently ignores
  // partialFilterExpression when supplied as a path-level option, so it is
  // asserted on the compiled schema indexes below rather than on the path.
  test("paymentId has no path-level unique (it is indexed at schema level)", () => {
    const opts = Payment.schema.path("paymentId").options;
    assert.notEqual(opts.unique, true, "path-level unique would compile a second, wrong index");
    assert.equal(opts.default, null, "paymentId still defaults to null");
  });

  test("orderId remains a plain unique index", () => {
    const opts = Payment.schema.path("orderId").options;
    assert.equal(opts.unique, true);
    assert.equal(opts.required, true);
  });

  test("invoiceNumber remains unique and sparse", () => {
    const opts = Payment.schema.path("invoiceNumber").options;
    assert.equal(opts.unique, true);
    assert.equal(opts.sparse, true, "invoiceNumber has no default, so sparse is correct there");
  });
});

// ---------------------------------------------------------------------------
// Mongoose compiles the intended index
// ---------------------------------------------------------------------------

describe("Mongoose compiled indexes", () => {
  const indexes = Payment.schema.indexes();

  const find = (field) => indexes.find(([spec]) => Object.prototype.hasOwnProperty.call(spec, field));

  test("paymentId compiles to a partial unique index", () => {
    const entry = find("paymentId");
    assert.ok(entry, "paymentId index must be declared on the schema");
    const [, options] = entry;
    assert.equal(options.unique, true, "uniqueness for real payment ids must NOT be removed");
    assert.deepEqual(
      options.partialFilterExpression,
      { paymentId: { $type: "string" } },
      "the index must be partial on string payment ids",
    );
    assert.equal(options.sparse, undefined, "sparse is superseded by the partial filter");
  });

  test("orderId compiles to a unique index covering every document", () => {
    const [, options] = find("orderId");
    assert.equal(options.unique, true);
    assert.equal(options.partialFilterExpression, undefined);
    assert.equal(options.sparse, undefined);
  });

  test("invoiceNumber compiles to a unique sparse index", () => {
    const [, options] = find("invoiceNumber");
    assert.equal(options.unique, true);
    assert.equal(options.sparse, true);
  });
});

// ---------------------------------------------------------------------------
// Matching semantics
// ---------------------------------------------------------------------------

/**
 * Faithful model of how MongoDB treats the two index styles. `$type: "string"`
 * matches only string values, so null, undefined and absent never collide;
 * a plain unique index treats an explicit null as a real indexed value.
 */
const matchesPartialPaymentIdIndex = (doc) => typeof doc.paymentId === "string";
const matchesSparseUniqueIndex = (doc) => doc.paymentId !== undefined;

const wouldCollide = (docs, doc, matches) => {
  if (!matches(doc)) return false;
  return docs.some((d) => d._id !== doc._id && matches(d) && d.paymentId === doc.paymentId);
};

const base = (over) => ({ _id: Math.random().toString(36), paymentId: null, ...over });

describe("multiple pending (paymentId: null) orders can coexist", () => {
  test("first created payment with paymentId null succeeds", () => {
    const stored = [];
    const doc = base({ status: "created" });
    assert.equal(wouldCollide(stored, doc, matchesPartialPaymentIdIndex), false);
    stored.push(doc);
    assert.equal(stored.length, 1);
  });

  test("second created payment with paymentId null succeeds", () => {
    const stored = [base({ status: "created" })];
    const doc = base({ status: "created" });
    assert.equal(
      wouldCollide(stored, doc, matchesPartialPaymentIdIndex),
      false,
      "a second pending order must not collide",
    );
    stored.push(doc);
    assert.equal(stored.length, 2);
  });

  test("many pending orders with null paymentId all coexist", () => {
    const stored = [];
    for (let i = 0; i < 25; i++) {
      const doc = base({ status: "created" });
      assert.equal(wouldCollide(stored, doc, matchesPartialPaymentIdIndex), false);
      stored.push(doc);
    }
    assert.equal(stored.length, 25);
  });

  test("a document with an ABSENT paymentId also coexists", () => {
    const stored = [base({ status: "created" })];
    const doc = base({ status: "created" });
    delete doc.paymentId;
    assert.equal(wouldCollide(stored, doc, matchesPartialPaymentIdIndex), false);
  });

  test("demonstrates why the old sparse-only index was broken", () => {
    // Guards the regression itself: with sparse-only semantics the very same two
    // documents DO collide, which is exactly the E11000 that was reported.
    const first = base({ status: "created" });
    const second = base({ status: "created" });
    assert.equal(wouldCollide([first], second, matchesSparseUniqueIndex), true);
    assert.equal(wouldCollide([first], second, matchesPartialPaymentIdIndex), false);
  });
});

describe("uniqueness for real Razorpay payment ids is preserved", () => {
  test("two paid payments with the SAME real paymentId are rejected", () => {
    const stored = [base({ paymentId: "pay_REAL123", status: "paid" })];
    const second = base({ paymentId: "pay_REAL123", status: "paid" });
    assert.equal(
      wouldCollide(stored, second, matchesPartialPaymentIdIndex),
      true,
      "a duplicate real payment id must still be rejected",
    );
  });

  test("two payments with DIFFERENT real paymentIds succeed", () => {
    const stored = [base({ paymentId: "pay_REAL123", status: "paid" })];
    const second = base({ paymentId: "pay_REAL456", status: "paid" });
    assert.equal(wouldCollide(stored, second, matchesPartialPaymentIdIndex), false);
  });

  test("a real paymentId cannot collide with a pending null order", () => {
    const stored = [base({ paymentId: null, status: "created" })];
    const paid = base({ paymentId: "pay_REAL123", status: "paid" });
    assert.equal(wouldCollide(stored, paid, matchesPartialPaymentIdIndex), false);
  });

  test("completing an order does not collide with other pending null orders", () => {
    const stored = [
      base({ paymentId: null, status: "created", orderId: "order_A" }),
      base({ paymentId: null, status: "created", orderId: "order_B" }),
    ];
    const completing = stored[0];
    completing.paymentId = "pay_AFTER_CHECKOUT";
    completing.status = "paid";
    assert.equal(wouldCollide(stored, completing, matchesPartialPaymentIdIndex), false);
  });
});

describe("orderId and invoiceNumber uniqueness are untouched", () => {
  const uniqueOn = (docs, doc, field) =>
    docs.some((d) => d._id !== doc._id && d[field] === doc[field]);

  test("two created payments with different orderIds can coexist", () => {
    const stored = [base({ orderId: "order_A", paymentId: null })];
    const doc = base({ orderId: "order_B", paymentId: null });
    assert.equal(uniqueOn(stored, doc, "orderId"), false);
  });

  test("orderId uniqueness remains enforced", () => {
    const stored = [base({ orderId: "order_A", paymentId: null })];
    const doc = base({ orderId: "order_A", paymentId: null });
    assert.equal(uniqueOn(stored, doc, "orderId"), true, "duplicate orderId must be rejected");
  });

  test("invoiceNumber uniqueness remains enforced", () => {
    const stored = [{ _id: "1", invoiceNumber: "INV-2026-ABC" }];
    assert.equal(uniqueOn(stored, { _id: "2", invoiceNumber: "INV-2026-ABC" }, "invoiceNumber"), true);
  });

  test("pending orders without an invoiceNumber can coexist", () => {
    // invoiceNumber is a SPARSE unique index, so a document where the field is
    // absent is not indexed and cannot collide with another absent one.
    const stored = [{ _id: "1" }];
    const doc = { _id: "2" };
    const sparseCollision = stored.some(
      (d) => d._id !== doc._id && d.invoiceNumber !== undefined && d.invoiceNumber === doc.invoiceNumber,
    );
    assert.equal(sparseCollision, false);
  });
});