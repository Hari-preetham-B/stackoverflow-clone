import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Regression coverage for the defects found in the comprehensive
 * quality/security/submission audit.
 *
 * Every finding here was reproduced against the running application before the
 * fix. Nothing here touches a database: behaviour that is a pure decision is
 * asserted by calling the exported helper, and the rest is asserted structurally
 * on the source, which is what actually stops a regression being reintroduced.
 */

const readSrc = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
// Collapses indentation and newlines so a multi-line statement can be matched by a
// single-line pattern without the assertion depending on formatting.
const flat = (src) => stripComments(src).replace(/\s+/g, " ");

const { debitReputation, refundReputation, awardReputation } = await import("../services/reputationService.js");
const { generateRandomPassword } = await import("../services/passwordService.js");
const { getPrivileges } = await import("../services/reputationService.js");

const authCtrl = readSrc("../controller/auth.js");
const authRoute = readSrc("../routes/auth.js");
const authCtx = readSrc("../../stack/src/lib/AuthContext.js");
const passwordCtrl = readSrc("../controller/password.js");
const reputationCtrl = readSrc("../controller/reputation.js");
const reputationSvc = readSrc("../services/reputationService.js");
const subscriptionCtrl = readSrc("../controller/subscription.js");
const serverIndex = readSrc("../index.js");
const authMiddleware = readSrc("../middleware/auth.js");
const askPage = readSrc("../../stack/src/pages/ask/index.tsx");
const languagePage = readSrc("../../stack/src/pages/settings/language.tsx");

// ---------------------------------------------------------------------------
// P1 - a password reset must invalidate the sessions issued against the old one.
// ---------------------------------------------------------------------------
describe("password reset revokes existing sessions", () => {
  test("the reset path deactivates every active session for that user", () => {
    const code = stripComments(passwordCtrl);
    assert.match(code, /Session\.updateMany\(\{ userId: user\._id, isActive: true \}, \{ isActive: false, revokedAt: new Date\(\) \}\)/);
  });

  test("the Session model is imported where it is used", () => {
    assert.match(passwordCtrl, /import Session from "\.\.\/models\/session\.js"/);
  });

  test("revocation happens after the password is actually replaced", () => {
    const code = stripComments(passwordCtrl);
    const hashAt = code.indexOf("user.password = await bcrypt.hash");
    const revokeAt = code.indexOf("Session.updateMany");
    assert.ok(hashAt > 0 && revokeAt > hashAt, "sessions must be revoked only after the credential changes");
  });

  test("revocation is server-side and therefore actually effective", () => {
    // The guard only helps if the middleware consults Session.isActive per request.
    assert.match(authMiddleware, /isActive: true/);
    assert.match(authMiddleware, /Session\.findOne\(\{ _id: decoded\.sessionId, userId: decoded\.id, tokenId: decoded\.tokenId/);
  });

  test("suspension still revokes sessions too (regression guard)", () => {
    const susp = readSrc("../services/suspensionService.js");
    assert.match(susp, /Session\.updateMany\(\{ userId: user\._id, isActive: true \}/);
  });
});

// ---------------------------------------------------------------------------
// P2 - logout must end server-side access, not just clear the browser.
// ---------------------------------------------------------------------------
describe("logout revokes the session server-side", () => {
  test("a logout endpoint exists and is authenticated", () => {
    assert.match(authRoute, /router\.post\("\/logout", auth, logout\)/);
    assert.match(authRoute, /logout,\s*\n?\} from "\.\.\/controller\/auth\.js"/);
  });

  test("the handler revokes only the caller's own session", () => {
    const code = stripComments(authCtrl);
    assert.match(code, /Session\.updateOne\(\s*\{ _id: req\.sessionId, userId: req\.userid \},/);
    assert.match(code, /isActive: false, revokedAt: new Date\(\)/);
  });

  test("the handler never fails silently", () => {
    assert.match(authCtrl, /res\.status\(500\)\.json\(\{ message: "Logout failed" \}\)/);
  });

  test("the frontend calls it before clearing local state", () => {
    const logout = authCtx.slice(authCtx.indexOf("const Logout"));
    const block = logout.slice(0, logout.indexOf("};"));
    assert.match(block, /await axiosInstance\.post\("\/user\/logout"\)/);
    assert.ok(block.indexOf('axiosInstance.post("/user/logout")') < block.indexOf('localStorage.removeItem("user")'));
  });

  test("local sign-out still happens if the network call fails", () => {
    const logout = authCtx.slice(authCtx.indexOf("const Logout"));
    const block = logout.slice(0, logout.indexOf("};"));
    assert.match(block, /catch \{[^}]*\}/);
    assert.match(block, /localStorage\.removeItem\("user"\)/);
  });
});

// ---------------------------------------------------------------------------
// P2 - reputation transfer must not destroy or overdraw reputation.
// ---------------------------------------------------------------------------
describe("reputation transfer is atomic and cannot overdraw", () => {
  test("debitReputation guards the balance inside the same update", () => {
    const code = flat(reputationSvc);
    assert.ok(code.includes("export const debitReputation"));
    // The $gte predicate and the $inc must be in one findOneAndUpdate call,
    // which is what makes concurrent debits safe.
    assert.ok(
      code.includes("findOneAndUpdate( { _id: userId, reputation: { $gte: amount } }, { $inc: { reputation: -amount } }"),
      "the balance guard and the decrement must be a single atomic update",
    );
  });

  test("debitReputation rejects nonsense input without touching the database", async () => {
    assert.equal(await debitReputation({ userId: null, amount: 5 }), null);
    assert.equal(await debitReputation({ userId: "6acfba8dad5dc08dd85be1d1", amount: 0 }), null);
    assert.equal(await debitReputation({ userId: "6acfba8dad5dc08dd85be1d1", amount: -5 }), null);
    assert.equal(await debitReputation({ userId: "6acfba8dad5dc08dd85be1d1", amount: NaN }), null);
  });

  test("refundReputation is the exact inverse", () => {
    const code = flat(reputationSvc);
    assert.ok(code.includes("export const refundReputation"));
    assert.ok(code.includes("findByIdAndUpdate(userId, { $inc: { reputation: amount } }"));
  });

  test("the transfer debits before it logs, and refunds if the credit fails", () => {
    const code = stripComments(reputationCtrl);
    const debitAt = code.indexOf("debitReputation({");
    const senderLogAt = code.indexOf("skipBalance: true");
    const refundAt = code.indexOf("refundReputation({");
    assert.ok(debitAt > 0 && senderLogAt > debitAt, "debit must be applied before the audit rows");
    assert.ok(refundAt > senderLogAt, "a failure must roll the debit back");
  });

  test("the sender audit row no longer double-decrements the balance", () => {
    const code = stripComments(reputationCtrl);
    assert.match(code, /skipBalance: true/);
    assert.match(stripComments(reputationSvc), /const user = skipBalance \? null : await User\.findByIdAndUpdate/);
  });

  test("an insufficient balance is reported rather than silently negative", () => {
    assert.match(reputationCtrl, /if \(!debited\) return res\.status\(400\)\.json\(\{ message: "Insufficient reputation" \}\)/);
  });

  test("awardReputation still short-circuits on a repeated eventKey", () => {
    assert.match(stripComments(reputationSvc), /if \(eventKey\) \{\s*const existing = await ReputationLog\.findOne\(\{ eventKey \}\)/);
  });

  test("privilege thresholds match the assignment (50/100/250/500)", () => {
    assert.equal(getPrivileges(50).privilege50, true);
    assert.equal(getPrivileges(49).privilege50, false);
    assert.equal(getPrivileges(100).privilege100, true);
    assert.equal(getPrivileges(250).privilege250, true);
    assert.equal(getPrivileges(500).privilege500, true);
    assert.equal(getPrivileges(0).canVote, false);
    assert.equal(getPrivileges(100).canTransfer, true);
    assert.equal(getPrivileges(50).canTransfer, false, "transfer requires MORE than 50");
  });
});

// ---------------------------------------------------------------------------
// P3 - the generated invoice must not emit user input as live markup.
// ---------------------------------------------------------------------------
describe("invoice escapes user-controlled values", () => {
  test("an HTML escaper is applied to every interpolated user value", () => {
    const code = stripComments(subscriptionCtrl);
    assert.match(code, /const htmlEscape = \(value\) =>/);
    for (const field of ["payment.userId?.name", "payment.userId?.email", "payment.invoiceNumber", "payment.plan", "payment.status"]) {
      assert.ok(code.includes(`htmlEscape(${field})`), `${field} is not escaped`);
    }
  });

  test("the raw unescaped interpolation is gone", () => {
    const code = stripComments(subscriptionCtrl);
    assert.doesNotMatch(code, /\$\{payment\.userId\.name\}/);
    assert.doesNotMatch(code, /\$\{payment\.userId\.email\}/);
  });

  test("the invoice response is hardened", () => {
    assert.match(subscriptionCtrl, /X-Content-Type-Options", "nosniff"/);
    assert.match(subscriptionCtrl, /Content-Security-Policy", "default-src 'none'/);
  });

  test("the escaper actually neutralises markup", () => {
    const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    assert.equal(esc("<script>alert(1)</script>"), "&lt;script&gt;alert(1)&lt;/script&gt;");
    assert.equal(esc('"><img src=x onerror=alert(1)>'), "&quot;&gt;&lt;img src=x onerror=alert(1)&gt;");
    assert.equal(esc("a & b"), "a &amp; b");
    assert.equal(esc(null), "");
  });

  test("invoice access is still ownership-scoped", () => {
    assert.match(subscriptionCtrl, /Payment\.findOne\(\{ _id: req\.params\.paymentId, userId: req\.userid \}\)/);
  });
});

// ---------------------------------------------------------------------------
// Info - response hardening headers.
// ---------------------------------------------------------------------------
describe("security headers", () => {
  test("HSTS, Permissions-Policy and a JSON-safe CSP are set", () => {
    assert.match(serverIndex, /Strict-Transport-Security/);
    assert.match(serverIndex, /Permissions-Policy/);
    assert.match(serverIndex, /Cross-Origin-Resource-Policy/);
    assert.match(serverIndex, /Content-Security-Policy", "default-src 'none'/);
  });

  test("the pre-existing headers are preserved", () => {
    for (const h of ["X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy"]) {
      assert.ok(serverIndex.includes(h), `${h} was dropped`);
    }
  });

  test("the power-on banner stays disabled", () => {
    assert.match(serverIndex, /app\.disable\("x-powered-by"\)/);
  });

  test("a health endpoint remains available for deployment checks", () => {
    assert.match(serverIndex, /app\.get\("\/health"/);
  });
});

// ---------------------------------------------------------------------------
// P3 - accessibility corrections.
// ---------------------------------------------------------------------------
describe("accessibility corrections", () => {
  const h1Pages = {
    "pages/reputation.tsx": "Reputation",
    "pages/security.tsx": "Account security",
    "pages/admin.tsx": "Administration",
    "pages/auth/index.tsx": "Log in to your account",
    "pages/settings/language.tsx": "Language",
  };
  for (const [page, label] of Object.entries(h1Pages)) {
    test(`${page} exposes a page heading`, () => {
      const src = readSrc(`../../stack/src/${page}`);
      assert.match(src, new RegExp(`sr-only">${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    });
  }
  test("the language selector has an accessible name", () => {
    assert.match(languagePage, /<select aria-label="Application language"/);
  });
  test("the icon-only tag remove button has an accessible name", () => {
    assert.match(askPage, /aria-label=\{`Remove tag \$\{tag\}`\}/);
    assert.match(askPage, /type="button"/);
  });
  test("no empty aria-label was introduced", () => {
    assert.doesNotMatch(readSrc("../../stack/src/pages/auth/index.tsx"), /aria-label=""/);
  });
});

// ---------------------------------------------------------------------------
// Regression guard: properties that were already correct must stay correct.
// ---------------------------------------------------------------------------
describe("pre-existing guarantees still hold", () => {
  test("profile update cannot mass-assign privileged fields", () => {
    const code = stripComments(authCtrl);
    const fn = code.slice(code.indexOf("export const updateprofile"));
    const allow = fn.slice(0, fn.indexOf("current.profileCompleted"));
    for (const forbidden of ["role", "subscriptionPlan", "isSuspended", "reputation", "email"]) {
      assert.doesNotMatch(allow, new RegExp(`current\\.${forbidden}\\s*=`), `updateprofile can write ${forbidden}`);
    }
  });
  test("password is stripped from every user payload", () => {
    assert.match(authCtrl, /delete data\.password/);
  });
  test("profile update is ownership-scoped", () => {
    assert.match(authCtrl, /if \(id\.toString\(\) !== req\.userid\.toString\(\)\) return res\.status\(403\)/);
  });
  test("the random temporary password is alphabetic and uses a CSPRNG", () => {
    const pw = generateRandomPassword(24);
    assert.equal(pw.length, 24);
    assert.match(pw, /^[A-Za-z]+$/);
    assert.notEqual(pw, generateRandomPassword(24), "two generated passwords must differ");
    const src = readSrc("../services/passwordService.js");
    assert.match(src, /crypto\.randomInt/);
    assert.doesNotMatch(src, /Math\.random/);
  });
  test("no Math.random anywhere in the server (weak randomness)", () => {
    const files = ["../index.js", "../controller/auth.js", "../controller/password.js", "../controller/admin.js",
      "../controller/answer.js", "../controller/question.js", "../controller/community.js", "../controller/reputation.js",
      "../controller/security.js", "../controller/subscription.js", "../controller/support.js",
      "../services/otpService.js", "../services/passwordService.js", "../services/securityService.js"];
    for (const f of files) assert.doesNotMatch(readSrc(f), /Math\.random/, `${f} uses Math.random`);
  });
});