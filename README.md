# CodeQuest — Stack Overflow Clone (Full-Stack Web Development Internship)

A Stack Overflow–style Q&A platform built as the **capstone deliverable for a Full Stack Web
Development internship**. It began as the training project's core clone — user accounts,
questions, answers and profiles on MongoDB with JWT authentication — and was then extended with
five internship-specific feature modules.

> **Project lineage:** this is the **same Stack Overflow clone used during training**, extended with
> the internship feature set. The original clone (signup, login, questions, answers, profiles,
> MongoDB, JWT) remains intact and is the foundation the internship modules build on.

---

## 1. Project overview

| | |
|---|---|
| **Frontend** | React 19 + Next.js 16 (Pages Router), TypeScript/TSX, Tailwind CSS 4, shadcn/ui |
| **Backend** | Node.js + Express 5 (ES modules), Mongoose 9 / MongoDB Atlas |
| **Authentication** | JWT bound to a server-side session, bcrypt password hashing |
| **Payments** | Razorpay (order creation + HMAC signature verification) |
| **Email** | Nodemailer over Gmail SMTP |
| **OTP** | bcrypt-hashed, single-use, 5-attempt-limited OTPs; Twilio Verify for phone |
| **Device intelligence** | User-agent parsing for browser / OS / device detection |
| **Testing** | Node's built-in test runner (`node:test`) + `node:assert/strict` — no external test framework |

**Codebase scale:** 63 registered API routes - 18 Mongoose models - 11 controllers - 12 services - 4 middleware modules - 23 frontend pages - 277 automated tests.

---

## 2. Internship context

The internship assigned five feature modules to be added to the existing training clone, each with
defined acceptance criteria. All five are implemented end-to-end and documented below.

Two design principles were applied consistently:

1. **The server is authoritative.** Entitlement, rate limits, daily quotas, moderation penalties and
   role checks are enforced in the backend. The frontend never decides whether a user is entitled
   to something.
2. **Fail closed, degrade gracefully.** Where an external provider is unavailable (Twilio), a
   documented development fallback exists so the flow remains testable without paid configuration.

---

## 3. Key features

All five internship modules, plus the original clone:

- **Original clone** — signup, login, logout, questions, answers, voting, user profiles
- **1. Subscription & Premium Membership** — Razorpay checkout, server-side entitlements
- **2. Forgot Password** — OTP-verified reset with a generated temporary password
- **3. Community Feed & Social Interaction** — posts, likes, comments, follows, moderation
- **4. Multi-language system** — six languages with OTP-gated switching
- **5. Advanced Login Security & Device Management** — sessions, device trust, new-device OTP
- **6. Reputation & Reward System** — earn/deduct rules, privileges, transfers

---

## 4. Subscription & Premium Membership

Users subscribe to one of four monthly plans. Entitlements are enforced **server-side**.

| Plan | Price | Questions/day | Badge | Advanced search | Search priority | Priority support | Profile visibility | Exclusive community |
|---|---|---|---|---|---|---|---|---|
| **Free** | ₹0 | 1 | — | No | 0 | No | Standard | No |
| **Bronze** | ₹99 | 5 | Bronze | Yes | 1 | No | Standard | No |
| **Silver** | ₹299 | 15 | Silver | Yes | 2 | Yes | Enhanced | No |
| **Gold** | ₹999 | Unlimited | Gold | Yes | 3 (highest) | Yes | Featured | Yes |

### What is implemented

- **Razorpay order creation** — the server creates the order and stores a `Payment` record.
- **Signature verification** — HMAC-SHA256 over `orderId|paymentId`, compared with
  `crypto.timingSafeEqual` (constant-time). The key secret never leaves the server.
- **Replay protection** — a payment that is already `status: "paid"` is rejected with
  *"Payment already verified"*, so a captured signature cannot be resubmitted to mint extra
  invoices, reset the renewal date, or resend confirmation mail. Covered by automated tests.
- **Subscription dashboard** — active plan, status, renewal date, billing details, payment history.
- **Unique invoices** — `INV-<year>-<random hex>`; the database enforces uniqueness. Invoices are
  downloadable per payment, scoped to the owning user.
- **Server-authoritative entitlements** — `GET /subscription/plans` and `GET /subscription/me`
  return a normalised entitlement object (`badge`, `dailyQuestions`, `advancedSearch`,
  `searchPriority`, `unlimitedBookmarks`, `prioritySupport`, `featuredProfile`,
  `enhancedProfileVisibility`, `exclusiveCommunity`).
- **Gold-exclusive community feed** — gated on `subscriptionPlan === "gold"` server-side.
- **Subscription expiry** — lapsed plans fall back to Free automatically on read.

### Premium benefits with a consuming surface

Three entitlements used to exist only as metadata returned by the API. They now have honest,
visible consumers. None of them claims a ranking effect that the backend does not actually apply.

- **Featured profile** (Gold) — `GET /user/getalluser` returns `featured: true` for Gold accounts
  and the public user directory renders a **Featured Profile** badge. It is a badge only: no
  position in search or in the feed is derived from it.
- **Enhanced profile visibility** (Silver and Gold) — the same endpoint returns
  `enhancedVisibility: true` and the directory renders an **Enhanced Visibility** badge. The badge
  deliberately does not claim search ranking, because no profile-ranking algorithm exists.
- **Priority support** (Silver and Gold) — a minimal, real support surface:
  - `POST /support/request` — any signed-in member may raise a request (`subject`, `message`).
  - `GET /support/requests/me` — the caller's own request history.
  - `GET /support/entitlement/me` — the caller's server-derived support entitlement.
  - **Priority is derived server-side from the caller's plan and can never be spoofed**: the client
    may send any `priority` value and it is ignored; the stored flag is computed from the plan at
    request time and snapshotted alongside the plan name, so a later plan change cannot rewrite the
    history of what was promised. Free and Bronze requests are stored with `priority: false`.
  - The subscription dashboard renders a **Priority Support** badge and a support form for entitled
    plans, and honest "standard queueing" wording for everyone else.
  - **Scope:** this is a request inbox, not a ticketing system. There is no staff-side triage
    dashboard, no assignment or SLA tracking, and no admin UI for the requests.

---

## 5. Forgot Password

A user supplies an **email address or phone number**, proves ownership with an OTP, and receives a
generated temporary password.

- **Once-per-day limit** — one reset request per calendar day; a second attempt returns HTTP 429
  with an explicit `dailyLimitReached` flag.
- **Secure OTP storage** — OTPs are bcrypt-hashed (never stored in plaintext), expire after
  10 minutes, are single-use, and are limited to **5 failed attempts**.
- **Alphabet-only temporary password** — generated from `A–Z a–z` only (no digits or symbols),
  hashed with bcrypt (cost 12) before storage, and emailed to the account owner.
- **Delivery channels** — email OTP for email identifiers; Twilio Verify SMS for phone numbers.
- **Failed-delivery rollback** — if delivery fails, the just-created OTP document is removed by its
  exact id, so no unusable OTP is left behind and no unrelated OTP is disturbed.
- **Language-channel parity** — French uses email OTP; all other languages use mobile OTP, with a
  documented email fallback when Twilio is not configured.

---

## 6. Community Feed & Social Interaction Platform

A social layer on top of the Q&A core, for sharing technical updates, projects, code and
achievements.

- **Posts** — text, optional image URL, optional code snippet; hashtags extracted automatically.
- **Interactions** — like/unlike, comments, threaded replies, share (link copy), bookmark.
- **Social graph** — follow/unfollow users; a personalised feed of followed authors.
- **Discovery** — trending feed scored on likes, comments and shares; hashtag indexing.
- **Ownership** — only the author can edit or delete a post (enforced by `authorId` match).
- **Moderation** — reporting with one report per user per post (unique index), plus an admin
  moderation queue that can review, dismiss or remove.
- **Suspension (repeat offenders)** — an admin can suspend or reinstate an account:
  - `POST /admin/users/:id/suspend` requires a reason and accepts an optional `durationDays`
    (1–365). Omit it for an indefinite suspension.
  - `POST /admin/users/:id/unsuspend` clears the flag, the reason and the expiry.
  - Both routes sit behind the existing `auth` + `admin` guard, so a normal user receives 403 and
    an anonymous caller 401. An administrator account cannot be suspended.
  - While a suspension is in force, the nine community write endpoints (create post, edit post,
    like, comment, reply, share, bookmark, follow, report) answer 403. Reading the feed, reading
    notifications and deleting your own post remain available so a suspended member can always
    clean up content they created.
  - A temporary suspension lapses on its own at the expiry instant — expiry is evaluated per
    request, so no background job is required.
  - Suspending also revokes that account's active sessions, because a JWT stays cryptographically
    valid until it expires and must not outlive the suspension.
  - **Scope:** suspension is enforced on community write operations only. Posting questions and
    answers is not currently affected, and there is no staff-side triage dashboard for it.
- **Hashtag filtering** — hashtags are extracted from post text, stored lowercase and indexed.
  `GET /community/posts/hashtag/:tag` returns the posts carrying a tag. The requested tag is
  trimmed, a leading `#` is stripped and the value is lowercased, so `Python`, `PYTHON`, `python`
  and `#Python` all match. Matching is an exact array comparison rather than a regex, so a partial
  or injected pattern cannot widen the result set. Deleted and moderated-away posts are excluded,
  and the endpoint returns the same `page`/`limit`/`total`/`hasMore` envelope as the main feed.
- **Notifications** — like, comment, reply, share, follow and payment events; self-actions are
  suppressed.
- **Pagination** — server-side `page`/`limit` with `total` and `hasMore`, powering "Load more".

---

## 7. Multi-language system

Six languages: **English, Spanish, Hindi, Portuguese, Chinese, French**.

- **French → email OTP.** Verified against the account's registered email address.
- **All other languages → mobile OTP** via Twilio Verify, using the account's phone number.
- **Verification is required** — `preferredLanguage` is only written to MongoDB after a successful
  OTP, so the language cannot be changed by an attacker who has a valid session but no phone access.
- **Persistence** — the preference is stored on the user document and read back on every load.
- **Fallback** — in development, when `TWILIO_VERIFY_SERVICE_SID` is absent, the OTP is delivered by
  email so the flow can be exercised without a paid Twilio Verify service.
- **Attempt protection** — language OTPs share the same hashed, expiring, single-use, 5-attempt
  mechanism as password-reset OTPs.

---

## 8. Advanced Login Security & Device Management

Standard email/password login, extended with session and device intelligence.

### On every login attempt the server records

Browser · Operating system · Device type · IP address · Location (when a reverse proxy supplies
`x-geo-city` / `cf-ipcity` / `x-vercel-ip-city`) · Timestamp · Success or failure.

### Device trust model

1. The browser's user-agent and parsed device/OS/browser are hashed into a **fingerprint**.
   The IP address is deliberately **excluded** from the fingerprint, so a changing IP (mobile
   networks, VPN) does not invalidate a trusted device.
2. A **known device** logs straight in and its trusted-device record is updated.
3. An **unknown device** gets a session in `isActive: false` and an **email OTP** (6 digits, 10
   minutes, 5 attempts). No usable token is issued until the OTP succeeds.
4. On success the session is activated, the device is optionally trusted for **30 days**, and a
   JWT is issued.

### Sessions and JWT

- The JWT carries `{id, email, sessionId, tokenId}` and is **bound to a server-side session
  document**. Every authenticated request re-validates the token *and* the live session record.
- Revoking a session, or the session expiring, immediately invalidates the JWT — the token alone is
  never sufficient.
- **Active sessions** can be listed and individually revoked from the Security page.
- **Trusted devices** can be listed and revoked.
- **Login activity** (including failed attempts) is stored per user, and an admin-only view shows
  activity across all users.
- Stale 401 responses clear local auth state and redirect to login automatically.

---

## 9. Reputation & Community Reward System

### Awards and deductions

| Event | Change |
|---|---|
| Answer posted | **+5** |
| Answer accepted | **+10** |
| Answer reaches 5 upvotes | **+5** |
| Question reaches 10 upvotes | **+2** |
| Profile completed | **+10** |
| Downvote received | **−2** |
| User deletes own answer | **−5** |
| Admin removes content | **−10** |

Every change is written to an append-only `ReputationLog` with the actor, reason, related entity and
timestamp. **Deduplication** is enforced by a unique sparse `eventKey` index, so a rule can never
fire twice for the same event — including when an admin retries a moderation action.

**Self-voting is rejected** (`400`), so reputation cannot be farmed by voting on your own content.

### Privileges

Unlocked at **50 / 100 / 250 / 500** reputation, plus vote and comment permissions and the
ability to transfer reputation.

### Transfers

Sender must hold **more than 50**; **maximum 50** per transaction and **100 per day**. Both sender
and receiver are validated, and each transfer records reason, timestamp and both parties in their
history. History is visible privately on the Reputation page and publicly on user profiles.

---

## 10. Technology stack

**Frontend** — React 19, Next.js 16 (Pages Router), TypeScript, Axios, Tailwind CSS 4
(`@tailwindcss/postcss`), shadcn/ui + `components.json` (9 UI primitives: button, card, input,
label, textarea, badge, avatar, dialog, checkbox), `lucide-react` icons, `react-toastify` for
notifications.

**Backend** — Node.js, Express 5 (ESM), Mongoose 9 / MongoDB Atlas, `jsonwebtoken`, `bcryptjs`,
`nodemailer`, `useragent`, `twilio`.

**Testing** — Node's built-in `node:test` runner and `node:assert/strict`. **No test framework
dependency was added**; tests run on the Node version the app already requires.

---

## 11. Project architecture

```
stackoverflow-clone/
├── server/                       Node.js + Express API
│   ├── index.js                  Entry point; CORS, security headers, routes, admin sync
│   ├── controller/   (11)        Request handling per domain
│   ├── services/      (12)       Business logic (security, OTP, subscription, reputation…)
│   ├── models/        (18)       Mongoose schemas
│   ├── middleware/     (4)        auth, admin, optionalAuth, rateLimit
│   ├── routes/        (11)       63 registered endpoints
│   └── tests/         (5)        node:test suites
└── stack/                        Next.js frontend
    ├── src/pages/     (23)       App Router-style page components under Pages Router
    ├── src/components/          Navbar, Sidebar, QuestionDetail, RightSideBar, ui/
    ├── src/lib/                 AuthContext, LanguageContext, axios instance, utils
    └── src/lib/__tests__/       node:test suite (TypeScript)
```

**Request flow:** `route → middleware (rate limit / auth / admin) → controller → service → model`.

**Security boundary for user content:** `user input → escapeHtml() → Markdown transforms →
renderQuestionBody() → dangerouslySetInnerHTML`. Only tags emitted by the renderer itself
(`p`, `h3`, `code`, `pre`, `ol`, `li`) can reach the DOM.

---

## 12. Backend setup

```powershell
cd server
npm install
Copy-Item .env.example .env    # then fill in the values
npm start                      # or: npm run dev  (nodemon)
```

The server starts on `PORT` (default 5000), exposes `GET /health`, and connects to MongoDB before
listening. On startup it runs an **idempotent admin-role sync**: the account matching
`ADMIN_EMAIL` is granted the `admin` role if it does not already have it. This is a `$set` scoped
to that one address — it never creates a user, never touches other accounts and never changes
credentials — and it writes nothing on subsequent restarts.

## 13. Frontend setup

```powershell
cd stack
npm install
Copy-Item .env.example .env    # set NEXT_PUBLIC_BACKEND_URL
npm run dev                    # http://localhost:3000
```

---

## 14. Environment variables

### `server/.env`

| Variable | Required | Purpose |
|---|---|---|
| `NODE_ENV` | yes | `development` enables the Twilio email fallback; use `production` when deployed |
| `PORT` | no | API port (default `5000`) |
| `MONGODB_URL` | yes | MongoDB Atlas / local connection string |
| `JWT_SECRET` | yes | Long random string used to sign and verify JWTs |
| `ADMIN_EMAIL` | yes | Email address that receives the `admin` role |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` | yes | SMTP server (`smtp.gmail.com`, `587`, `false`) |
| `SMTP_USER` / `SMTP_PASSWORD` | yes | Sender account and Google **App Password** |
| `SMTP_FROM` | yes | From address for transactional mail |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | yes | Razorpay keys (use **TEST** keys for local work) |
| `CORS_ORIGIN` | recommended | Comma-separated allowed frontend origins. Defaults to `http://localhost:3000` when unset. Set `*` only to allow everything |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | optional | Twilio credentials |
| `TWILIO_VERIFY_SERVICE_SID` | optional | **Required for phone OTP in production.** When blank in development, a documented email fallback is used instead |

### `stack/.env`

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_BACKEND_URL` | yes | Public base URL of the deployed backend API |

---

## 15. Running locally

```powershell
# terminal 1 — API
cd server; npm install; npm start

# terminal 2 — web app
cd stack; npm install; npm run dev
```

Open <http://localhost:3000>. Verify the API with `GET http://localhost:5000/health`.

---

## 16. Testing

```powershell
cd server; npm test    # 243 tests
cd stack;  npm test    # 34 tests

# from the project root — runs both suites
node --test server/tests/*.test.js stack/src/lib/__tests__/*.test.ts   # 277 tests

# type check
node stack/node_modules/typescript/bin/tsc --noEmit --incremental false -p stack/tsconfig.json

# backend syntax
node --check <each server .js file>
```

The suites cover the two most security-critical areas:

- **Admin role synchronisation** — `ADMIN_EMAIL` normalisation, exact query filter and update
  shape, idempotency (no second write), no insert/upsert/replace/delete, and error containment.
- **XSS rendering** — 15 payloads (script, `img onerror`, `svg onload`, `javascript:` URLs,
  mixed-case tags, newline-split handlers, mXSS), Markdown fidelity, and escaping invariants.

Tests are fully offline: no database, no external services, and no real credentials.

## 17. Production build

```powershell
cd stack
npm run build     # compiles and statically generates all pages
npm start         # serve the production build
```

Backend production: `cd server && npm start` with `NODE_ENV=production`.

---

## 18. Deployment information

The deployment procedure — backend hosting, frontend hosting on Vercel/Netlify, environment
variables, and the required `CORS_ORIGIN` / `NEXT_PUBLIC_BACKEND_URL` relationship — is documented
in **[DEPLOYMENT_AND_COMMITS.md](DEPLOYMENT_AND_COMMITS.md)**.

**Deployment status: pending.** No public deployment URL exists yet, and none is claimed here. The
internship requirement is to publish the frontend publicly on Vercel or Netlify, with the backend
reachable at a public HTTPS URL.

---

## 19. Known limitations / verification notes

These are **verification and deployment limitations**, not implementation failures.

1. **No live Razorpay payment was completed.** Razorpay TEST credentials were confirmed valid and
   the order-creation, signature-verification and replay-protection logic is covered by automated
   tests, but no real checkout was finished end-to-end. Completing one TEST-mode checkout remains a
   step for the live deployment.
2. **The database contains no reputation activity.** Reputation rules are implemented and their
   privilege/dedupe logic is verified by tests, but the complete earn → transfer → penalise
   lifecycle has not been demonstrated against populated production-like data, because the
   database currently holds no questions, answers, community posts or reputation logs.
3. **`prioritySupport` and `featuredProfile` are entitlement metadata.** The project has no
   support-ticket system and no separate featured-profile surface, so these are declared in the
   entitlement payload rather than backed by a dedicated feature.
4. **Phone OTP / Twilio was not live-tested.** No Twilio Verify service was used. The development
   email fallback exists and is exercised by tests; production phone OTP requires a real
   `TWILIO_VERIFY_SERVICE_SID`.
5. **SMTP delivery was not exercised in CI.** Email content and trigger points are implemented and
   covered by tests with an injected mailer; actual Gmail delivery depends on a valid App Password.
6. **Responsive layout is implemented but not device-verified.** Tailwind breakpoints and a
   collapsible sidebar are present, but behaviour has not been formally confirmed on physical
   mobile/tablet hardware. Final live-device verification is recommended before submission.
7. **Rate limiting is in-process.** It is correct for a single Node instance; a multi-instance
   deployment would need a shared store such as Redis.
8. **No Content-Security-Policy header.** Baseline security headers are set manually; a CSP would
   need tuning against the Next.js and Razorpay checkout scripts.

---

## 20. Security measures

- **Password hashing** — bcrypt, cost factor 12; passwords are `select: false` and never returned
  by any endpoint.
- **Session-bound JWT** — every request re-validates the live session, so revocation is immediate.
- **Session-bound OTP** — bcrypt-hashed, 10-minute expiry, single-use, 5-attempt limit.
- **Ownership enforcement** — edit/delete operations match the authenticated user against the
  document owner for questions, answers and community posts.
- **Role-based authorization** — admin routes sit behind `auth` + `admin` middleware; the admin
  role is derived from `ADMIN_EMAIL` and reconciled at startup.
- **Resource scoping** — invoices are queried by `{_id, userId}`, so one user cannot read another's
  invoice.
- **Stored XSS prevention** — all user-supplied question/answer content is HTML-escaped before
  rendering; only renderer-generated tags reach the DOM.
- **Rate limiting** — in-process fixed-window limits on login, password reset, password OTP,
  new-device verification and language OTP.
- **CORS allowlist** — configurable via `CORS_ORIGIN`, defaults to the local development origin;
  unrestricted access requires an explicit `*`.
- **Security headers** — `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and
  `X-Powered-By` disabled.
- **Least-privilege responses** — the public user directory exposes no `role`, no `email` and no
  `password`; community feeds no longer expose author email addresses.
- **Privacy** — Twilio, Razorpay and SMTP credentials live only in environment variables and are
  never committed; `.env` is git-ignored.
- **Database integrity** — unique indexes prevent duplicate users, sessions, devices, reports,
  bookmarks, payments and reputation events.

---

## 21. Internship submission notes

- **Relationship to the training project:** the original clone's signup/login, questions, answers,
  profiles, MongoDB and JWT layers were kept intact; the internship modules are additive.
- **Every server-authoritative rule** (plan quotas, entitlements, moderation penalties, role
  checks, rate limits) is enforced in the backend, never trusted from the client.
- **Test coverage:** 277 automated tests across both packages, including the two highest-risk
  security paths.
- **Build status:** TypeScript reports 0 diagnostics; the production Next.js build succeeds and
  generates all pages.
- **Version control:** the repository is initialised with `.gitignore` coverage for `node_modules`,
  `.next`, build info and all `.env` files. No credential has ever been committed.
- **Before final hand-off:** complete one Razorpay TEST checkout, populate demonstration data so
  the reputation lifecycle can be shown end-to-end, confirm responsive behaviour on a real device,
  and publish the frontend as required by the internship.

### Supporting documents

| Document | Purpose |
|---|---|
| [IMPLEMENTATION_VERIFICATION.md](IMPLEMENTATION_VERIFICATION.md) | What each module implements |
| [FINAL_VERIFICATION_REPORT.md](FINAL_VERIFICATION_REPORT.md) | Verification evidence and results |
| [RUN_AND_TEST.md](RUN_AND_TEST.md) | Step-by-step local run and test order |
| [TEST_CHECKLIST.md](TEST_CHECKLIST.md) | Manual verification checklist |
| [DEPLOYMENT_AND_COMMITS.md](DEPLOYMENT_AND_COMMITS.md) | Deployment and commit procedure |
