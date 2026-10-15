import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Regression tests: malformed resource ids must be rejected with 400, never
 * surfaced as an unhandled Mongoose CastError (500).
 *
 * The audit found that the ObjectId guard had only been applied to a handful of
 * routes, so 18 of the 20 id-taking endpoints answered 500 for `/not-an-id`.
 *
 * These tests are dependency-free and never touch MongoDB. They exploit the fact
 * that every guard runs BEFORE the first model call: calling a handler with a
 * malformed id therefore returns 400 without a query ever being issued. If a
 * guard were removed the handler would fall through to Mongoose, which - with no
 * connection - would buffer and time out, failing the test. A "no database was
 * contacted" assertion is therefore implicit in these passing.
 */

const BAD = "not-an-object-id";
const GOOD = "6acfbfd13fc240f411d2c1e1";
const OTHER = "6acfbfd13fc240f411d2c1ff";

const mockRes = () => {
  const res = { statusCode: null, body: null, ended: false };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.body = payload; res.ended = true; return res; };
  res.setHeader = () => res;
  res.send = () => { res.ended = true; return res; };
  return res;
};

const run = async (handler, { params = {}, body = {}, query = {}, userid = "6acfbfd13fc240f411d2c1c00" } = {}) => {
  const res = mockRes();
  await handler({ params, body, query, userid, headers: {} }, res);
  return res;
};

const community = await import("../controller/community.js");
const question = await import("../controller/question.js");
const answer = await import("../controller/answer.js");
const security = await import("../controller/security.js");
const admin = await import("../controller/admin.js");
const reputation = await import("../controller/reputation.js");
const communitySrc = readFileSync(new URL("../controller/community.js", import.meta.url), "utf8");

describe("malformed post id -> 400 (community)", () => {
  const cases = [
    ["PATCH /community/posts/:id", community.updatePost, { id: BAD }],
    ["DELETE /community/posts/:id", community.deletePost, { id: BAD }],
    ["POST /community/posts/:id/like", community.likePost, { id: BAD }],
    ["POST /community/posts/:id/comments", community.commentPost, { id: BAD }],
    ["POST /community/posts/:id/share", community.sharePost, { id: BAD }],
    ["POST /community/posts/:id/bookmark", community.bookmarkPost, { id: BAD }],
    ["POST /community/posts/:id/report", community.reportPost, { id: BAD }],
  ];
  for (const [label, handler, params] of cases) {
    test(`${label} answers 400`, async () => {
      const res = await run(handler, { params });
      assert.equal(res.statusCode, 400);
      assert.match(res.body.message, /Invalid/i);
    });
  }

  test("POST /community/posts/:id/comments/:commentId/replies answers 400 for a bad post id", async () => {
    const res = await run(community.replyComment, { params: { id: BAD, commentId: GOOD } });
    assert.equal(res.statusCode, 400);
  });

  test("POST /community/posts/:id/comments/:commentId/replies answers 400 for a bad comment id", async () => {
    const res = await run(community.replyComment, { params: { id: GOOD, commentId: BAD } });
    assert.equal(res.statusCode, 400);
  });

  test("PATCH /community/admin/posts/:id/moderate answers 400", async () => {
    const res = await run(community.moderatePost, { params: { id: BAD }, body: { status: "hidden" } });
    assert.equal(res.statusCode, 400);
  });

  test("moderation status is validated before the id", async () => {
    const res = await run(community.moderatePost, { params: { id: BAD }, body: { status: "nonsense" } });
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /Invalid moderation status/);
  });
});

describe("malformed question id -> 400", () => {
  test("POST /question/bookmark/:id", async () => {
    assert.equal((await run(question.bookmarkQuestion, { params: { id: BAD } })).statusCode, 400);
  });
  test("POST /question/:id/flag", async () => {
    assert.equal((await run(question.flagQuestion, { params: { id: BAD }, body: { reason: "x" } })).statusCode, 400);
  });
  test("PATCH /question/:id/answers/:answerId/accept", async () => {
    assert.equal((await run(question.acceptAnswer, { params: { id: BAD, answerId: GOOD } })).statusCode, 400);
    assert.equal((await run(question.acceptAnswer, { params: { id: GOOD, answerId: BAD } })).statusCode, 400);
  });
  test("PATCH /question/:id/answers/:answerId/vote", async () => {
    assert.equal((await run(question.voteAnswer, { params: { id: BAD, answerId: GOOD }, body: { value: "upvote" } })).statusCode, 400);
    assert.equal((await run(question.voteAnswer, { params: { id: GOOD, answerId: BAD }, body: { value: "upvote" } })).statusCode, 400);
  });
});

/**
 * The final two id-taking routes that were still missing a guard. Both are
 * proven twice:
 *
 *  1. a malformed id answers 400 without ever reaching Mongoose, so the test
 *     needs no database and writes nothing;
 *  2. a well-formed id is NOT intercepted by the guard - it proceeds to the
 *     query, which (with no connection) surfaces as a Mongoose buffering
 *     timeout rather than a 400. That distinguishes "guard passed the id
 *     through" from "guard swallowed it".
 *
 * The 404-for-a-nonexistent-but-well-formed-id branch is additionally covered
 * live by the HTTP acceptance harness.
 */
describe("malformed id -> 400 (final two routes)", async () => {
  const mongoose = (await import("mongoose")).default;
  const subscription = await import("../controller/subscription.js");

  // Short buffer timeout so step 2 fails fast instead of hanging for 10s.
  mongoose.set("bufferTimeoutMS", 250);

  const probes = [
    ["POST /community/users/:userId/follow", community.followUser, { userId: BAD }, "Invalid user ID"],
    ["GET /subscription/invoice/:paymentId", subscription.getInvoice, { paymentId: BAD }, "Invalid payment ID"],
  ];

  for (const [label, handler, params, message] of probes) {
    test(`${label}: malformed id answers 400 without touching the database`, async () => {
      const res = await run(handler, { params });
      assert.equal(res.statusCode, 400);
      assert.equal(res.body.message, message);
    });

    test(`${label}: a well-formed id passes the guard and reaches the query`, async () => {
      const res = mockRes();
      const wellFormed = Object.fromEntries(Object.entries(params).map(([key]) => [key, GOOD]));
      // The caller id is deliberately different from the target id so that
      // followUser's "cannot follow yourself" check does not fire first.
      const req = { params: wellFormed, body: {}, query: {}, userid: OTHER, headers: {} };
      let reachedQuery = false;
      try {
        await handler(req, res);
      } catch (error) {
        // With no connection open, getting past the guard means the handler
        // reached its query and failed at the Mongoose layer - either a
        // buffering timeout (no connection) or a cast error. Either outcome
        // proves the guard did NOT intercept the id.
        reachedQuery = /buffering timed out|Cast to ObjectId failed|MongooseError/.test(error.message);
      }
      assert.equal(res.statusCode, null, "a well-formed id must not be rejected as malformed");
      assert.equal(reachedQuery, true, "expected the handler to reach its database query");
    });
  }
});

describe("malformed answer id -> 400", () => {
  test("DELETE /answer/delete/:id with a bad question id", async () => {
    assert.equal((await run(answer.deleteanswer, { params: { id: BAD }, body: { answerid: GOOD } })).statusCode, 400);
  });
  test("DELETE /answer/delete/:id with a bad answer id", async () => {
    assert.equal((await run(answer.deleteanswer, { params: { id: GOOD }, body: { answerid: BAD } })).statusCode, 400);
  });
  test("DELETE /answer/admin-delete/:id/:answerId", async () => {
    assert.equal((await run(answer.adminDeleteAnswer, { params: { id: BAD, answerId: GOOD } })).statusCode, 400);
    assert.equal((await run(answer.adminDeleteAnswer, { params: { id: GOOD, answerId: BAD } })).statusCode, 400);
  });
});

describe("malformed id -> 400 (security and admin)", () => {
  test("DELETE /security/trusted-devices/:deviceId", async () => {
    assert.equal((await run(security.revokeTrustedDevice, { params: { deviceId: BAD } })).statusCode, 400);
  });
  test("DELETE /security/sessions/:sessionId", async () => {
    assert.equal((await run(security.revokeSession, { params: { sessionId: BAD } })).statusCode, 400);
  });
  test("PATCH /admin/reports/:id", async () => {
    assert.equal((await run(admin.moderateReport, { params: { id: BAD }, body: { status: "reviewed" } })).statusCode, 400);
  });
  test("PATCH /admin/content-reports/:id", async () => {
    assert.equal((await run(admin.moderateContentReport, { params: { id: BAD }, body: { status: "reviewed" } })).statusCode, 400);
  });
  test("GET /reputation/:userId", async () => {
    assert.equal((await run(reputation.getPublicReputation, { params: { userId: BAD } })).statusCode, 400);
  });
});

describe("moderated content is not interactable", () => {
  // The query filters are asserted statically because the handlers read their
  // models at module scope and cannot be injected. Live behaviour is covered by
  // the acceptance harness, which confirms a "removed" post returns 404 for
  // like and comment.
  test("interaction handlers scope their lookup to visible, non-deleted posts", () => {
    assert.match(communitySrc, /const VISIBLE = \{ isDeleted: false, moderationStatus: "visible" \};/);
    const interactive = ["updatePost", "likePost", "commentPost", "replyComment", "sharePost"];
    for (const fn of interactive) {
      const body = communitySrc.slice(communitySrc.indexOf(`export const ${fn} =`));
      const end = body.indexOf("\n};");
      assert.match(body.slice(0, end), /\.\.\.VISIBLE/, `${fn} must filter on VISIBLE`);
    }
  });

  test("bookmarkPost still resolves removed posts so an existing bookmark can be undone", () => {
    // Removing the existing bookmark must keep working even for a post that is
    // no longer visible, otherwise a user could never clear a stale bookmark.
    const body = communitySrc.slice(communitySrc.indexOf("export const bookmarkPost ="));
    assert.match(body.slice(0, body.indexOf("\n};")), /CommunityPost\.findById\(req\.params\.id\)/);
  });
});
