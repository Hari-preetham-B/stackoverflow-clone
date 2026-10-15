import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Dependency-free regression tests for the assignment gap-closure work.
 *
 * Nothing here touches a database. Handlers whose guard runs before the first
 * query are asserted on that guard; everything else is asserted on an exported
 * pure helper, or on the source itself where the property is structural.
 */

// ---- hoisted imports (await is only legal at module top level) ------------
const readSrc = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

const { isSuspended } = await import("../services/suspensionService.js");
const User = (await import("../models/auth.js")).default;
const { getEntitlements, PLANS } = await import("../services/subscriptionService.js");

const communitySrc = readSrc("../controller/community.js");
const communityRoutesSrc = readSrc("../routes/community.js");
const adminRouteSrc = readSrc("../routes/admin.js");
const adminCtrlSrc = readSrc("../controller/admin.js");
const suspensionSrc = readSrc("../services/suspensionService.js");
const authCtrlSrc = readSrc("../controller/auth.js");
const supportCtrlSrc = readSrc("../controller/support.js");
const supportRouteSrc = readSrc("../routes/support.js");
const indexSrc = readSrc("../index.js");
const langSrc = readSrc("../../stack/src/lib/LanguageContext.js");
const sidebarSrc = readSrc("../../stack/src/components/Sidebar.tsx");

// ---------------------------------------------------------------------------
describe("suspension: expiry semantics", () => {
  const soon = (ms) => new Date(Date.now() + ms);

  test("a clean account is not suspended", () => {
    assert.equal(isSuspended({ isSuspended: false, suspendedUntil: null }), false);
    assert.equal(isSuspended({}), false);
    assert.equal(isSuspended(null), false);
    assert.equal(isSuspended(undefined), false);
  });

  test("an indefinite suspension is in force when no expiry is set", () => {
    assert.equal(isSuspended({ isSuspended: true, suspendedUntil: null }), true);
  });

  test("a future expiry is still in force", () => {
    assert.equal(isSuspended({ isSuspended: true, suspendedUntil: soon(3600000) }), true);
  });

  test("an EXPIRED temporary suspension lapses automatically (no job needed)", () => {
    assert.equal(isSuspended({ isSuspended: true, suspendedUntil: soon(-1000) }), false);
    assert.equal(isSuspended({ isSuspended: true, suspendedUntil: soon(-86400000) }), false);
  });

  test("an expired date never lifts an unset flag", () => {
    assert.equal(isSuspended({ isSuspended: false, suspendedUntil: soon(-1000) }), false);
  });
});

// ---------------------------------------------------------------------------
describe("suspension: user model fields", () => {
  test("the schema carries the three suspension fields", () => {
    assert.equal(User.schema.path("isSuspended").instance, "Boolean");
    assert.equal(User.schema.path("suspendedUntil").instance, "Date");
    assert.equal(User.schema.path("suspensionReason").instance, "String");
  });

  test("defaults are safe (not suspended, no reason, no expiry)", () => {
    const doc = new User({ name: "T", email: "t@example.test", password: "x" });
    assert.equal(doc.isSuspended, false);
    assert.equal(doc.suspendedUntil, null);
    assert.equal(doc.suspensionReason, null);
  });

  test("suspension state is settable", () => {
    const doc = new User({ name: "T", email: "t2@example.test", password: "x" });
    doc.isSuspended = true;
    doc.suspensionReason = "repeat spam reports";
    doc.suspendedUntil = new Date(Date.now() + 86400000);
    assert.equal(doc.isSuspended, true);
    assert.equal(doc.suspensionReason, "repeat spam reports");
    assert.ok(doc.suspendedUntil instanceof Date);
  });
});

// ---------------------------------------------------------------------------
describe("suspension: community write routes are guarded", () => {
  const guarded = [
    'router.post("/posts", auth, requireNotSuspended, createPost)',
    'router.patch("/posts/:id", auth, requireNotSuspended, updatePost)',
    'router.post("/posts/:id/like", auth, requireNotSuspended, likePost)',
    'router.post("/posts/:id/comments", auth, requireNotSuspended, commentPost)',
    'router.post("/posts/:id/comments/:commentId/replies", auth, requireNotSuspended, replyComment)',
    'router.post("/posts/:id/share", auth, requireNotSuspended, sharePost)',
    'router.post("/posts/:id/bookmark", auth, requireNotSuspended, bookmarkPost)',
    'router.post("/users/:userId/follow", auth, requireNotSuspended, followUser)',
    'router.post("/posts/:id/report", auth, requireNotSuspended, reportPost)',
  ];
  for (const line of guarded) {
    test(`guarded: ${line.split(", ")[0]}`, () => assert.ok(communityRoutesSrc.includes(line), line));
  }

  test("deleting your OWN post stays available while suspended", () => {
    assert.ok(communityRoutesSrc.includes('router.delete("/posts/:id", auth, deletePost)'));
    assert.ok(!communityRoutesSrc.includes('router.delete("/posts/:id", auth, requireNotSuspended'));
  });

  test("read routes stay open", () => {
    assert.ok(communityRoutesSrc.includes('router.get("/feed", auth, getFeed)'));
    assert.ok(communityRoutesSrc.includes('router.get("/trending", auth, getTrending)'));
    assert.ok(communityRoutesSrc.includes('router.get("/notifications", auth, getNotifications)'));
  });
});

// ---------------------------------------------------------------------------
describe("suspension: admin endpoints", () => {
  test("suspend and unsuspend routes exist", () => {
    assert.ok(adminRouteSrc.includes('router.post("/users/:id/suspend", suspendUser)'));
    assert.ok(adminRouteSrc.includes('router.post("/users/:id/unsuspend", unsuspendUser)'));
  });

  test("the whole admin router is behind auth + admin", () => {
    assert.ok(adminRouteSrc.includes("router.use(auth, admin);"));
  });

  test("a reason is mandatory", () => {
    assert.match(adminCtrlSrc, /if \(!reason\) return res\.status\(400\)/);
  });

  test("duration is validated and bounded to 365 days", () => {
    assert.match(adminCtrlSrc, /durationDays <= 0 \|\| durationDays > 365/);
  });

  test("admins cannot be suspended", () => {
    assert.match(adminCtrlSrc, /user\.role === "admin"[\s\S]{0,160}cannot be suspended/);
  });

  test("malformed id returns 400, never 500", () => {
    assert.ok(adminCtrlSrc.includes("!mongoose.Types.ObjectId.isValid(req.params.id)"));
  });

  test("suspending revokes the user's active sessions", () => {
    assert.match(suspensionSrc, /Session\.updateMany\(\{ userId: user\._id, isActive: true \}/);
  });
});

// ---------------------------------------------------------------------------
describe("personalized feed affinity scoring", () => {
  test("the formula is documented in a comment", () => {
    assert.match(communitySrc, /score = followedAuthor\s+\* 50/);
    assert.match(communitySrc, /likes\s+\* 3/);
    assert.match(communitySrc, /comments\s+\* 4/);
    assert.match(communitySrc, /shares\s+\* 6/);
    assert.match(communitySrc, /recencyBonus = max\(0, 25 - ageInHours \/ 2\)/);
  });

  test("scoring is deterministic (no randomness)", () => {
    const fn = communitySrc.slice(communitySrc.indexOf("const affinityScore"), communitySrc.indexOf("// Ranking happens in memory"));
    assert.ok(fn.length > 0);
    assert.ok(!/Math\.random/.test(fn), "affinity scoring must not use randomness");
  });

  test("ties break deterministically for stable pagination", () => {
    assert.match(communitySrc, /b\.score - a\.score \|\| new Date\(b\.post\.createdAt\) - new Date\(a\.post\.createdAt\) \|\| String\(a\.post\._id\)\.localeCompare/);
  });

  test("ranking is applied before pagination", () => {
    assert.ok(communitySrc.includes("const slice = ranked.slice((page - 1) * limit, page * limit);"));
    assert.ok(communitySrc.indexOf("const ranked = candidates") < communitySrc.indexOf("const slice = ranked.slice"));
  });

  test("follow relationships still gate the candidate set", () => {
    assert.match(communitySrc, /const followedIds = new Set\(follows\.map\(\(f\) => f\.followingId\.toString\(\)\)\)/);
    assert.match(communitySrc, /authorId: \{ \$in: ids \}/);
  });

  test("the ranking window is bounded", () => {
    assert.match(communitySrc, /const AFFINITY_WINDOW = \d+/);
    assert.match(communitySrc, /limit\(AFFINITY_WINDOW\)/);
  });

  test("hasMore/total metadata is preserved", () => {
    assert.match(communitySrc, /pagination: \{ page, limit, total, hasMore: page \* limit < total \}/);
  });

  test("trending is untouched by the affinity change", () => {
    const trending = communitySrc.slice(communitySrc.indexOf("export const getTrending"), communitySrc.indexOf("export const updatePost"));
    assert.ok(trending.length > 0);
    assert.ok(!/affinityScore/.test(trending), "trending must not use the affinity scorer");
    assert.match(trending, /\(a\.likes\?\.length \|\| 0\) \+ \(a\.comments\?\.length \|\| 0\) \* 2/);
  });
});

// ---------------------------------------------------------------------------
describe("hashtag filtering", () => {
  const fn = communitySrc.slice(communitySrc.indexOf("export const getPostsByHashtag"), communitySrc.indexOf("export const updatePost"));

  test("route exists and requires auth", () => {
    assert.ok(communityRoutesSrc.includes('router.get("/posts/hashtag/:tag", auth, getPostsByHashtag)'));
  });

  test("the route is declared before the generic /posts routes", () => {
    assert.ok(communityRoutesSrc.indexOf('/posts/hashtag/:tag') < communityRoutesSrc.indexOf('router.post("/posts"'));
  });

  test("the tag is normalised (trimmed, leading # stripped, lowercased)", () => {
    assert.match(communitySrc, /String\(req\.params\.tag \|\| ""\)\.trim\(\)\.replace\(\/\^#\/, ""\)\.toLowerCase\(\)/);
  });

  test("an empty tag is rejected with 400", () => {
    assert.match(communitySrc, /if \(!tag\) return res\.status\(400\)/);
  });

  test("deleted and moderated-away posts are excluded", () => {
    assert.match(fn, /const filter = \{ \.\.\.VISIBLE, hashtags: tag \}/);
  });

  test("matching is exact-array, not a regex (no injection or partial widening)", () => {
    assert.ok(fn.length > 0);
    assert.ok(!/new RegExp/.test(fn), "must not build a RegExp from user input");
    assert.match(fn, /hashtags: tag/);
  });

  test("the same pagination envelope as the main feed is returned", () => {
    assert.match(fn, /pagination: \{ page, limit, total, hasMore: page \* limit < total \}/);
    assert.match(fn, /readPaging\(req\)/);
  });

  test("pagination is clamped to the same bounds as the feed", () => {
    assert.match(communitySrc, /limit: Math\.min\(Math\.max\(Number\(req\.query\.limit\) \|\| 10, 1\), 50\)/);
  });

  test("the normal feed route is unchanged", () => {
    assert.ok(communityRoutesSrc.includes('router.get("/feed", auth, getFeed)'));
  });
});

// ---------------------------------------------------------------------------
describe("premium entitlement consumption", () => {
  const publicDir = authCtrlSrc.slice(authCtrlSrc.indexOf("export const getallusers"), authCtrlSrc.indexOf("export const updateprofile"));

  test("public directory exposes featured and enhancedVisibility", () => {
    assert.match(publicDir, /featured: entitlements\.featuredProfile/);
    assert.match(publicDir, /enhancedVisibility: entitlements\.enhancedProfileVisibility/);
  });

  test("public directory still selects no email and no role", () => {
    assert.ok(!/select\("[^"]*email/.test(publicDir), "must not select email");
    assert.ok(!/\brole:\s*u\b/.test(publicDir), "must not expose role");
  });

  test("featured profile is Gold only", () => {
    assert.equal(getEntitlements("gold").featuredProfile, true);
    assert.equal(getEntitlements("silver").featuredProfile, false);
    assert.equal(getEntitlements("bronze").featuredProfile, false);
    assert.equal(getEntitlements("free").featuredProfile, false);
  });

  test("enhanced visibility is Silver and Gold", () => {
    assert.equal(getEntitlements("gold").enhancedProfileVisibility, true);
    assert.equal(getEntitlements("silver").enhancedProfileVisibility, true);
    assert.equal(getEntitlements("bronze").enhancedProfileVisibility, false);
    assert.equal(getEntitlements("free").enhancedProfileVisibility, false);
  });

  test("priority support is Silver and Gold", () => {
    assert.equal(getEntitlements("gold").prioritySupport, true);
    assert.equal(getEntitlements("silver").prioritySupport, true);
    assert.equal(getEntitlements("bronze").prioritySupport, false);
    assert.equal(getEntitlements("free").prioritySupport, false);
  });

  test("plan pricing is unchanged by this work", () => {
    assert.deepEqual(
      { free: PLANS.free.price, bronze: PLANS.bronze.price, silver: PLANS.silver.price, gold: PLANS.gold.price },
      { free: 0, bronze: 99, silver: 299, gold: 999 },
    );
  });

  test("daily question limits are unchanged", () => {
    assert.equal(PLANS.free.dailyQuestions, 1);
    assert.equal(PLANS.bronze.dailyQuestions, 5);
    assert.equal(PLANS.silver.dailyQuestions, 15);
    assert.equal(PLANS.gold.dailyQuestions, null);
  });

  test("support priority is derived server-side, never from the body", () => {
    assert.match(supportCtrlSrc, /priority: entitlements\.prioritySupport === true/);
    assert.ok(!/req\.body[^\n]*priority/.test(supportCtrlSrc), "client must not be able to set priority");
  });

  test("support request validates subject and message", () => {
    assert.match(supportCtrlSrc, /Subject is required/);
    assert.match(supportCtrlSrc, /Message is required/);
  });

  test("support routes are all authenticated", () => {
    for (const line of ['router.post("/request", auth, createSupportRequest)', 'router.get("/requests/me", auth, getMySupportRequests)', 'router.get("/entitlement/me", auth, getMySupportEntitlement)']) {
      assert.ok(supportRouteSrc.includes(line), line);
    }
  });

  test("the support router is mounted", () => {
    assert.match(indexSrc, /app\.use\("\/support", supportRoutes\)/);
  });
});

// ---------------------------------------------------------------------------
describe("localization", () => {
  const REQUIRED = ["home", "questions", "community", "premium", "reputation", "security", "language", "login", "logout", "tags", "users"];
  const LANGS = ["en", "es", "hi", "pt", "zh", "fr"];

  test("the language file is valid UTF-8 with no replacement characters", () => {
    assert.equal((langSrc.match(/\uFFFD/g) || []).length, 0);
  });

  for (const lang of LANGS) {
    test(`${lang} defines all ${REQUIRED.length} keys`, () => {
      const m = langSrc.match(new RegExp(`\\n\\s{2}${lang}: \\{([^}]*)\\}`));
      assert.ok(m, `${lang} block missing`);
      for (const key of REQUIRED) assert.match(m[1], new RegExp(`${key}:\\s*"[^"]+"`), `${lang}.${key}`);
    });
  }

  test("the two newly added keys are genuinely translated, not English fallbacks", () => {
    // Correctness here means "not the English string", not "different from every
    // other language": Spanish and Portuguese both legitimately use "Etiquetas",
    // so an all-distinct rule would be wrong rather than strict.
    const get = (lang, key) => {
      const m = langSrc.match(new RegExp(`\\n\\s{2}${lang}: \\{([^}]*)\\}`));
      return new RegExp(`${key}:\\s*"([^"]*)"`).exec(m[1])?.[1];
    };
    for (const key of ["tags", "users"]) {
      for (const lang of LANGS.filter((l) => l !== "en")) {
        const value = get(lang, key);
        assert.ok(value, `${lang}.${key} missing`);
        assert.notEqual(value, get("en", key), `${lang}.${key} falls back to English`);
      }
    }
    assert.equal(get("hi", "tags"), "टैग");
    assert.equal(get("zh", "users"), "用户");
    assert.equal(get("fr", "tags"), "Étiquettes");
  });

  test("pre-existing keys still resolve in every language", () => {
    const get = (lang, key) => {
      const m = langSrc.match(new RegExp(`\\n\\s{2}${lang}: \\{([^}]*)\\}`));
      return new RegExp(`${key}:\\s*"([^"]*)"`).exec(m[1])?.[1];
    };
    // Spot-check that nothing regressed while adding the new keys.
    assert.equal(get("en", "home"), "Home");
    assert.equal(get("fr", "home"), "Accueil");
    assert.equal(get("hi", "home"), "होम");
    assert.equal(get("zh", "home"), "首页");
    assert.equal(get("es", "community"), "Comunidad");
    assert.equal(get("pt", "users"), "Usuários");
  });

  test("the sidebar consumes tags/users through t()", () => {
    assert.ok(sidebarSrc.includes('t("tags")'));
    assert.ok(sidebarSrc.includes('t("users")'));
    assert.ok(!sidebarSrc.includes('["/tags", "Tags", Tag]'), "hardcoded Tags label must be gone");
    assert.ok(!sidebarSrc.includes('["/users", "Users", Users]'), "hardcoded Users label must be gone");
  });
});
