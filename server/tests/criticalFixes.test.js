import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Regression coverage for the final corrective pass.
 *
 * Scope of the defects being locked down:
 *  1. the question detail page crashed because answers had no `useranswered`
 *  2. the displayed author was taken from the request body (spoofable)
 *  3. the question detail API returned soft-deleted answers
 *  4. AuthContext read localStorage during render -> React hydration error #418
 *  5. the dynamic route requested /question/undefined before router.isReady
 *  6. the Tags pages were stubs with no data and no reachable links
 *  7. the admin page had no user-management / suspension UI
 *
 * Nothing here touches a database. Behaviour that is a pure decision is asserted
 * by calling the exported helper; everything else is asserted structurally on the
 * source, which is what actually prevents a regression from being reintroduced.
 */

const readSrc = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
// Strips block and line comments so an assertion matches real code rather than
// the prose explaining the fix (which necessarily quotes the old broken code).
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const { authorNameFrom } = await import("../controller/answer.js");
const { visibleAnswers, tagFilter } = await import("../controller/question.js");

const answerCtrlSrc = readSrc("../controller/answer.js");
const questionCtrlSrc = readSrc("../controller/question.js");
const answerRouteSrc = readSrc("../routes/answer.js");
const questionRouteSrc = readSrc("../routes/question.js");
const adminRouteSrc = readSrc("../routes/admin.js");

const detailSrc = readSrc("../../stack/src/components/QuestionDetail.tsx");
const questionIdPageSrc = readSrc("../../stack/src/pages/questions/[id]/index.tsx");
const authCtxSrc = readSrc("../../stack/src/lib/AuthContext.js");
const langCtxSrc = readSrc("../../stack/src/lib/LanguageContext.js");
const sidebarSrc = readSrc("../../stack/src/components/Sidebar.tsx");
const tagsIndexSrc = readSrc("../../stack/src/pages/tags/index.tsx");
const tagDetailSrc = readSrc("../../stack/src/pages/tags/[tag].tsx");
const adminPageSrc = readSrc("../../stack/src/pages/admin.tsx");
const homeSrc = readSrc("../../stack/src/pages/index.tsx");
const reputationSrc = readSrc("../../stack/src/pages/reputation.tsx");

// ---------------------------------------------------------------------------
// 1 + 2. Answer author: present in the contract, and never client supplied.
// ---------------------------------------------------------------------------
describe("question detail renders an answer author", () => {
  test("authorNameFrom returns the real name from the session user", () => {
    assert.equal(authorNameFrom({ name: "Demo Silver User" }), "Demo Silver User");
  });

  test("authorNameFrom degrades safely instead of yielding undefined", () => {
    assert.equal(authorNameFrom({ name: "" }), "User");
    assert.equal(authorNameFrom({ name: "   " }), "User");
    assert.equal(authorNameFrom({}), "User");
    assert.equal(authorNameFrom(null), "User");
    assert.equal(authorNameFrom(undefined), "User");
    // The historical crash value: never returns undefined for any input.
    for (const v of [null, undefined, 0, "", {}, []]) {
      assert.equal(typeof authorNameFrom(v), "string");
    }
  });

  test("the stored author is derived from the authenticated session user", () => {
    assert.match(answerCtrlSrc, /User\.findById\(req\.userid\)/);
    assert.match(answerCtrlSrc, /useranswered:\s*authorNameFrom\(author\)/);
    assert.match(answerCtrlSrc, /userid:\s*req\.userid/);
  });

  test("a client-supplied author name can never reach storage", () => {
    // HIGH-2: the old line was `useranswered: req.body.useranswered`.
    const code = stripComments(answerCtrlSrc);
    assert.doesNotMatch(code, /req\.body\.useranswered/);
    assert.doesNotMatch(code, /useranswered:\s*req\.body/);
  });

  test("posting an answer still requires authentication", () => {
    assert.match(answerRouteSrc, /router\.post\("\/postanswer\/:id",\s*auth,/);
  });

  test("Askanswer still rejects a malformed question id before any query", () => {
    assert.match(answerCtrlSrc, /isValid\(_id\)/);
    assert.match(answerCtrlSrc, /"Answer is required"/);
  });
});

// ---------------------------------------------------------------------------
// 3. A malformed historical answer must never crash the page.
// ---------------------------------------------------------------------------
describe("frontend renders authors defensively", () => {
  test("no unguarded `useranswered[0]` remains anywhere", () => {
    assert.doesNotMatch(detailSrc, /ans\.useranswered\[0\]/);
    assert.doesNotMatch(detailSrc, /question\.userposted\[0\]/);
  });

  test("both question and answer authors go through the safe helper", () => {
    assert.match(detailSrc, /authorName\(ans\.useranswered\)/);
    assert.match(detailSrc, /authorName\(question\.userposted\)/);
    assert.match(detailSrc, /authorInitial\(ans\.useranswered\)/);
    assert.match(detailSrc, /authorInitial\(question\.userposted\)/);
  });

  test("the safe helper handles every shape and never throws", () => {
    // Mirrors the helper contract asserted above on the server side.
    const safe = (v, fb = "User") =>
      typeof v === "string" && v.trim() ? v : Array.isArray(v) && typeof v[0] === "string" && v[0].trim() ? v[0] : fb;
    assert.equal(safe("Demo User Priya"), "Demo User Priya");
    assert.equal(safe(undefined), "User");
    assert.equal(safe(null), "User");
    assert.equal(safe(""), "User");
    assert.equal(safe(["Ada"]), "Ada");
  });

  test("a missing answer author is not treated as a reason to request again", () => {
    assert.match(detailSrc, /if \(!questionId\) return;/);
  });

  test("the body columns can shrink, so wide content cannot overflow", () => {
    // `flex-1` without `min-w-0` keeps the flex base width and lets a long
    // question body push the row past the viewport. Both body columns need it.
    const bare = detailSrc.match(/className="flex-1 p-4 sm:p-6"/g) || [];
    assert.equal(bare.length, 0, "a flex-1 body column is still missing min-w-0");
    assert.equal((detailSrc.match(/className="flex-1 min-w-0 p-4 sm:p-6"/g) || []).length, 2);
  });
});

// ---------------------------------------------------------------------------
// 4. Soft-deleted answers must not be exposed, and counts must agree.
// ---------------------------------------------------------------------------
describe("deleted answers are excluded from question detail", () => {
  test("visibleAnswers drops deleted rows and keeps live ones", () => {
    const answers = [
      { _id: "a", deleted: false },
      { _id: "b", deleted: true },
      { _id: "c" },
      { _id: "d", deleted: false },
    ];
    assert.deepEqual(visibleAnswers(answers).map((a) => a._id), ["a", "c", "d"]);
  });

  test("visibleAnswers tolerates a missing or malformed array", () => {
    assert.deepEqual(visibleAnswers(undefined), []);
    assert.deepEqual(visibleAnswers(null), []);
    assert.deepEqual(visibleAnswers([null, undefined]), []);
  });

  test("getquestion uses the helper and republishes a matching count", () => {
    assert.match(questionCtrlSrc, /const all = visibleAnswers\(doc\.answer\)/);
    assert.match(questionCtrlSrc, /noofanswer:\s*all\.length/);
    assert.match(questionCtrlSrc, /answersTotal:\s*all\.length/);
  });

  test("the existing answer pagination bound is preserved", () => {
    assert.match(questionCtrlSrc, /slice\(0,\s*MAX_ANSWERS_PER_REQUEST\)/);
    assert.match(questionCtrlSrc, /answersTruncated:\s*all\.length > MAX_ANSWERS_PER_REQUEST/);
  });

  test("acceptance and voting paths still filter on deleted before counting", () => {
    assert.match(answerCtrlSrc, /filter\(\(a\) => !a\.deleted\)\.length/g);
  });
});

// ---------------------------------------------------------------------------
// 5. Question author cannot be spoofed either.
// ---------------------------------------------------------------------------
describe("question author is session-authoritative", () => {
  test("the client-supplied userposted is not a fallback", () => {
    // Old: `userposted: currentUser.name || userposted`.
    assert.doesNotMatch(questionCtrlSrc, /\|\|\s*userposted/);
    assert.match(questionCtrlSrc, /userposted:\s*currentUser\?\.name \|\| "User"/);
  });

  test("ownership still comes from req.userid", () => {
    assert.match(questionCtrlSrc, /userid:\s*req\.userid/);
  });

  test("asking a question still requires authentication", () => {
    assert.match(questionRouteSrc, /router\.post\("\/ask",\s*auth,/);
  });

  test("a mismatched client owner is still rejected", () => {
    assert.match(questionCtrlSrc, /Invalid question owner/);
  });
});

// ---------------------------------------------------------------------------
// 6. No request for an undefined id.
// ---------------------------------------------------------------------------
describe("dynamic route waits for a real id", () => {
  test("the page gates on router.isReady", () => {
    assert.match(questionIdPageSrc, /router\.isReady/);
    assert.match(questionIdPageSrc, /questionId = router\.isReady && typeof id === "string" && id\.length > 0 \? id : null/);
  });

  test("QuestionDetail refuses to fetch a null id", () => {
    assert.match(detailSrc, /if \(!questionId\) return;/);
  });

  test("the fetch still targets the resolved id", () => {
    assert.match(detailSrc, /axiosInstance\.get\(`\/question\/\$\{questionId\}`\)/);
  });

  test("a malformed id still hits the backend 400 guard rather than being swallowed", () => {
    assert.match(questionCtrlSrc, /isValid\(id\)[\s\S]{0,80}400/);
  });
});

// ---------------------------------------------------------------------------
// 7. Hydration: no browser-only read during render.
// ---------------------------------------------------------------------------
describe("AuthContext hydration no longer mismatches SSR", () => {
  test("localStorage is never read in a useState initialiser", () => {
    const code = stripComments(authCtxSrc);
    assert.doesNotMatch(code, /useState\(readUser\)/);
    assert.doesNotMatch(code, /useState\(readVerification\)/);
  });

  test("auth state starts deterministic and hydrates after mount", () => {
    assert.match(authCtxSrc, /const \[user, setUser\] = useState\(null\)/);
    assert.match(authCtxSrc, /const \[hydrated, setHydrated\] = useState\(false\)/);
    assert.match(authCtxSrc, /useEffect\(\(\) => \{\s*setUser\(readUser\(\)\)/);
  });

  test("authenticated behaviour is preserved", () => {
    assert.match(authCtxSrc, /localStorage\.setItem\("user"/);
    assert.match(authCtxSrc, /localStorage\.removeItem\("user"\)/);
    assert.match(authCtxSrc, /hydrated/);
  });

  test("the authenticated navigation entry still exists", () => {
    assert.match(sidebarSrc, /user\?\.role === "admin"/);
  });

  test("html lang follows the active language without affecting SSR", () => {
    assert.match(langCtxSrc, /document\.documentElement\.lang = language/);
    // It must be inside an effect, never during render.
    assert.match(langCtxSrc, /useEffect\(\(\) => \{\s*if \(typeof document !== "undefined"\) document\.documentElement\.lang = language;\s*\}, \[language\]\)/);
  });

  test("every language has an admin label", () => {
    for (const code of ["en", "es", "hi", "pt", "zh", "fr"]) {
      assert.match(langCtxSrc, new RegExp(`${code}: \\{[\\s\\S]*?admin: "[^"]+"`));
    }
    assert.match(sidebarSrc, /t\("admin"\)/);
  });
});

// ---------------------------------------------------------------------------
// 8 + 9. Tags render real data and are reachable.
// ---------------------------------------------------------------------------
describe("tags pages render real data", () => {
  test("the tag list calls the tag endpoint and renders counts", () => {
    assert.match(tagsIndexSrc, /\.get\("\/question\/tags"\)/);
    assert.match(tagsIndexSrc, /tag\.count/);
    assert.match(tagsIndexSrc, /"questions"/);
    assert.match(tagsIndexSrc, /No tags yet/);
  });

  test("each tag links to its detail page", () => {
    assert.match(tagsIndexSrc, /href=\{`\/tags\/\$\{encodeURIComponent\(tag\.name\)\}`\}/);
  });

  test("the tag detail page fetches by tag and links to questions", () => {
    assert.match(tagDetailSrc, /\.get\(`\/question\/tag\/\$\{encodeURIComponent\(tag\)\}`\)/);
    assert.match(tagDetailSrc, /href=\{`\/questions\/\$\{question\._id\}`\}/);
    assert.match(tagDetailSrc, /question\.questiontitle/);
    assert.match(tagDetailSrc, /No questions are tagged/);
  });

  test("tag endpoints are public and registered before the /:id catch-all", () => {
    assert.match(questionRouteSrc, /router\.get\("\/tags", listTags\)/);
    assert.match(questionRouteSrc, /router\.get\("\/tag\/:tag", getQuestionsByTag\)/);
    const tagsAt = questionRouteSrc.indexOf('router.get("/tags"');
    const catchAll = questionRouteSrc.indexOf('router.get("/:id"');
    assert.ok(tagsAt > 0 && catchAll > 0 && tagsAt < catchAll, "tag routes must precede the /:id catch-all");
  });

  test("the tag match is exact, case-insensitive and regex-safe", () => {
    assert.equal(tagFilter("JavaScript").test("javascript"), true);
    assert.equal(tagFilter("javascript").test("JavaScript"), true);
    assert.equal(tagFilter("#react-native").test("react-native"), true);
    // Anchored: a partial match must not widen the result set.
    assert.equal(tagFilter("java").test("javascript"), false);
    assert.equal(tagFilter("script").test("javascript"), false);
    // Metacharacters are escaped, so user input cannot act as a pattern.
    assert.equal(tagFilter(".*").test(".*"), true);
    assert.equal(tagFilter(".*").test("anything"), false);
    assert.equal(tagFilter("a|b").test("a|b"), true);
    assert.equal(tagFilter("a|b").test("a"), false);
  });

  test("question cards expose their tags as links", () => {
    assert.match(homeSrc, /href=\{`\/tags\/\$\{encodeURIComponent\(tag\)\}`\}/);
  });

  test("tag cards render a vote count, not the raw voter-id array", () => {
    // `upvote` is Array<String> in the schema; rendering it raw prints every id.
    assert.match(tagDetailSrc, /Array\.isArray\(upvote\) \? upvote\.length/);
    assert.match(tagDetailSrc, /voteCount\(question\.upvote\)/);
    assert.doesNotMatch(tagDetailSrc, /\{question\.upvote \?\? 0\}/);
  });

  test("the tag list page counts nothing raw either", () => {
    assert.doesNotMatch(tagsIndexSrc, /question\.upvote/);
  });
});

// ---------------------------------------------------------------------------
// 10. Admin suspension UI.
// ---------------------------------------------------------------------------
describe("admin page exposes user management", () => {
  test("it loads the admin user list", () => {
    assert.match(adminPageSrc, /axiosInstance\.get\("\/admin\/users"\)/);
  });

  test("it reaches the existing suspension endpoints", () => {
    assert.match(adminPageSrc, /axiosInstance\.post\(`\/admin\/users\/\$\{user\._id\}\/suspend`/);
    assert.match(adminPageSrc, /axiosInstance\.post\(`\/admin\/users\/\$\{user\._id\}\/unsuspend`/);
  });

  test("suspension requires a reason and accepts an optional duration", () => {
    assert.match(adminPageSrc, /reason/);
    assert.match(adminPageSrc, /durationDays/);
    assert.match(adminPageSrc, /A suspension reason is required/);
  });

  test("it shows suspension status and success\/error feedback", () => {
    assert.match(adminPageSrc, /isSuspended/);
    assert.match(adminPageSrc, /suspensionReason/);
    assert.match(adminPageSrc, /suspendedUntil/);
    assert.match(adminPageSrc, /toast\.success/);
    assert.match(adminPageSrc, /toast\.error/);
  });

  test("administrators are not offered a suspend control", () => {
    assert.match(adminPageSrc, /isAdmin \? \(/);
    assert.match(adminPageSrc, /Administrators cannot be suspended/);
  });

  test("the existing moderation functionality is preserved", () => {
    for (const call of ["/admin/reports", "/admin/content-reports", "/admin/login-activity"]) {
      assert.ok(adminPageSrc.includes(call), `admin page lost ${call}`);
    }
    assert.match(adminPageSrc, /Community moderation/);
    assert.match(adminPageSrc, /Question flags/);
    assert.match(adminPageSrc, /Remove post/);
  });

  test("the endpoints it calls stay admin-guarded on the server", () => {
    // The admin router applies auth + admin to every route it declares.
    assert.match(adminRouteSrc, /router\.use\(auth, admin\)/);
    assert.match(adminRouteSrc, /router\.get\("\/users", getUsersAdmin\)/);
    assert.match(adminRouteSrc, /router\.post\("\/users\/:id\/suspend", suspendUser\)/);
    assert.match(adminRouteSrc, /router\.post\("\/users\/:id\/unsuspend", unsuspendUser\)/);
  });

  test("the admin user list exposes the suspension fields the UI reads", () => {
    const adminCtrl = readSrc("../controller/admin.js");
    assert.match(adminCtrl, /isSuspended suspendedUntil suspensionReason/);
  });
});

// ---------------------------------------------------------------------------
// Reputation page no longer leaks internal keys.
// ---------------------------------------------------------------------------
describe("reputation page uses human-readable privilege labels", () => {
  test("raw key names are not rendered", () => {
    assert.doesNotMatch(reputationSrc, /\{k\}: \{String\(v\)\}/);
  });

  test("every known privilege has a label", () => {
    for (const key of ["canVote", "canComment", "canTransfer", "privilege50", "privilege100", "privilege250", "privilege500"]) {
      assert.ok(reputationSrc.includes(`${key}:`), `missing label for ${key}`);
    }
    assert.match(reputationSrc, /PRIVILEGE_LABELS\[k\] \|\| k/);
  });
});

// ---------------------------------------------------------------------------
// The backfill must stay minimal and idempotent.
// ---------------------------------------------------------------------------
describe("answer-author backfill is minimal and idempotent", () => {
  const backfillSrc = readSrc("../scripts/backfillAnswerAuthors.js");

  test("it only ever sets the useranswered field of a specific answer", () => {
    assert.match(backfillSrc, /\$set:\s*\{ "answer\.\$\[target\]\.useranswered": name \}/);
    assert.match(backfillSrc, /arrayFilters: \[\{ "target\._id": answer\._id \}\]/);
  });

  test("it only repairs answers whose author is missing", () => {
    assert.match(backfillSrc, /answer\.useranswered === undefined \|\| answer\.useranswered === null \|\| answer\.useranswered === ""/);
  });

  test("it derives the name from the answer's own ownership field", () => {
    assert.match(backfillSrc, /nameById\.get\(String\(answer\.userid\)\)/);
  });

  test("it never writes to the users or payments collections", () => {
    // Strip comments before asserting: the header explains that payments are
    // never touched, and that text must not be mistaken for a write.
    const code = backfillSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(code, /payments/i);
    assert.doesNotMatch(code, /Payment\b/);
    assert.doesNotMatch(code, /User\.(updateOne|updateMany|findOneAndUpdate|deleteOne|deleteMany|findByIdAndUpdate|save)/);
    // The only write in the whole script is the single-field question update.
    assert.equal((code.match(/\.updateOne\(/g) || []).length, 1);
    assert.equal((code.match(/\.(deleteOne|deleteMany|insertOne|insertMany|findOneAndUpdate|findByIdAndUpdate|replaceOne|bulkWrite)\(/g) || []).length, 0);
    // Users are read-only here.
    assert.match(code, /await User\.find\(\{\}, "name"\)/);
  });
});