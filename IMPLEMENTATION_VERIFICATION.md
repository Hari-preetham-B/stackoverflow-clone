# Final implementation verification

This document describes **what is currently implemented**. Verification results are recorded in
[FINAL_VERIFICATION_REPORT.md](FINAL_VERIFICATION_REPORT.md); the local run order is in
[RUN_AND_TEST.md](RUN_AND_TEST.md).

Project scale: **63 registered API routes - 18 Mongoose models - 11 controllers - 12 services -
4 middleware modules - 23 frontend pages - 172 automated tests.**

## Feature groups

### Authentication and security
- Signup with name, email, optional phone and password validation.
- Login with bcrypt password verification (cost factor 12).
- JWT tied to a server-side session; every authenticated request re-validates the live session, so
  revocation and expiry take effect immediately.
- New-device email OTP (6 digits, 10-minute expiry, 5 failed attempts, single use).
- Persistent trusted devices with a 30-day expiry; IP is deliberately excluded from the device
  fingerprint.
- Active-session listing and revocation; trusted-device listing and revocation.
- Login activity including failed logins, with an admin-only cross-user view.
- Stale 401 sessions automatically clear local auth state and redirect to login.
- Idempotent startup sync grants the `ADMIN_EMAIL` account the `admin` role; it performs no write on
  subsequent restarts.
- In-process rate limiting on login, password reset, password OTP, new-device verification and
  language OTP.

### Forgot password
- Email or phone identifier.
- Once-per-day request limit; a second attempt returns HTTP 429 with `dailyLimitReached`.
- OTP is bcrypt-hashed, expires after 10 minutes, is single-use and limited to five failed attempts.
- Alphabet-only temporary password (upper and lowercase letters, no digits or symbols), hashed with
  bcrypt before storage.
- Temporary password delivered by email.
- Phone OTP uses Twilio Verify when configured.
- When `TWILIO_VERIFY_SERVICE_SID` is absent in development, an email OTP fallback is used so the
  complete flow is testable without Twilio. **This fallback is implemented and its OTP channel is a
  valid, validated value in the schema.**
- If OTP delivery fails, the newly created OTP document is removed by its exact id so no unusable
  record is left behind.

### Premium subscriptions
- Free, Bronze ₹99, Silver ₹299 and Gold ₹999 plans.
- Server-side daily question limits (1 / 5 / 15 / unlimited).
- Advanced-search subscription gate.
- Razorpay order creation and HMAC-SHA256 signature verification using `crypto.timingSafeEqual`.
- **Replay protection** — a payment already marked `paid` is rejected with *"Payment already
  verified"*, preventing duplicate invoices, renewal-date resets and repeated notifications/emails.
- Subscription status, renewal date and automatic expiry back to Free.
- Payment history and billing details.
- Downloadable invoice, scoped to the owning user.
- Payment confirmation email and in-app notification.
- Server-authoritative entitlement payload (`badge`, `dailyQuestions`, `advancedSearch`,
  `searchPriority`, `unlimitedBookmarks`, `prioritySupport`, `featuredProfile`,
  `enhancedProfileVisibility`, `exclusiveCommunity`).
- Gold exclusive community feed.

### Community
- Text/image/code posts; hashtags extracted automatically and indexed.
- Personalized/follow feed with server-side pagination (`page`, `limit`, `total`, `hasMore`).
- Trending feed scored on likes, comments and shares.
- Like/unlike, comments and replies, share with link copying, bookmarks, follow/unfollow.
- Edit/delete own posts only, enforced by `authorId` match.
- Reports (one per user per post, enforced by a unique index) and admin moderation.
- Notifications for like, comment, reply, share, follow and payment events; self-actions suppressed.
- Gold exclusive feed.
- Author email addresses are **not** exposed in community payloads.

### Multi-language
- English, Spanish, Hindi, Portuguese, Chinese and French.
- French verification through email OTP.
- Other languages use Twilio mobile OTP when configured.
- Local development email fallback when Twilio Verify is absent.
- Preferred language persisted on the user document and applied to navigation labels.
- Verification is required before the preference is written; language OTPs use the same hashed,
  expiring, single-use, five-attempt mechanism as password-reset OTPs.

### Reputation
- All required awards and deductions: +5 answer, +10 accepted answer, +5 at five answer upvotes,
  +2 at ten question upvotes, +10 profile completion; −2 downvote, −5 user deletes answer,
  −10 admin removes content.
- The −10 admin penalty is applied on all three moderation paths: answers, questions and community
  posts.
- **Self-voting is rejected**, so reputation cannot be self-generated.
- Deduplication via a unique sparse `eventKey` index, so a rule cannot fire twice — including when
  an admin retries a moderation action.
- Privilege thresholds at 50/100/250/500.
- Transfer validation: sender >50, maximum 50 per transaction and 100 per day.
- Sender, receiver, reason and timestamp recorded in logs.
- Private reputation history page and public reputation history on profiles.

### Question and answer interactions
- Question creation with server-side daily plan limit (HTTP 429 with the plan name).
- **Paginated** question listing with safe defaults and a maximum limit; the embedded answer array
  is excluded from list responses.
- **Dedicated question-by-id endpoint** with bounded answer arrays (`answersTotal`,
  `answersTruncated`); the question page no longer downloads the whole dataset to find one question.
- Question and answer voting; accepting an answer; deletion with ownership checks.
- Persistent question bookmarks and share/flag actions on questions and answers.
- Question flagging and admin moderation.

### Security and privacy hardening
- Stored XSS prevented by escaping all user content before rendering; only renderer-generated tags
  (`p`, `h3`, `code`, `pre`, `ol`, `li`) reach the DOM.
- CORS allowlist configurable via `CORS_ORIGIN`, defaulting to the local development origin.
- Security headers `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`;
  `X-Powered-By` disabled.
- ObjectId validation on user-supplied route parameters so malformed ids return 400, not 500.
- Public user directory exposes no `role`, `email` or `password`.
- Resource ownership scoping, including invoices.

### UI interaction audit
- Navbar navigation is functional.
- Search form is functional.
- Sidebar links are functional.
- Home question filters are functional.
- Custom-filter and watched-tag controls navigate to their respective modules.
- OAuth buttons provide explicit configuration feedback instead of silently submitting the form.
- Terms and Privacy links point to real pages.
- Profile editing, skill add/remove and save/cancel are functional.
- Admin controls are functional.
- No `href="#"` placeholders remain.

## Static verification performed

- All **55** backend JavaScript files passed `node --check`.
- Backend relative import/export audit passed.
- Frontend TypeScript compilation passes with **0 diagnostics**.
- Frontend local import existence audit passed.
- **63 registered backend routes**; **36 frontend Axios call sites**; every call maps to a registered
  route with a matching HTTP method and request shape.
- Static internal page/link audit passed across the Next.js pages.
- Production Next.js build succeeds and generates all pages.
- No real `.env`, `node_modules`, `.next`, or TypeScript build-info files are included in the
  package.

## Runtime limitations

- No live Razorpay payment has been completed; credentials, signature verification and replay
  protection are verified, but a real TEST-mode checkout is still outstanding.
- The database contains no reputation activity, so the full reputation lifecycle has not been
  demonstrated against populated production-like data.
- Phone OTP via Twilio has not been live-tested because no Twilio Verify service was used.
- `prioritySupport` and `featuredProfile` exist as entitlement metadata; the project has no
  support-ticket system or dedicated featured-profile surface.
- Responsive layout is implemented but has not been verified on physical mobile/tablet hardware.

See [README.md](README.md) for the full list of known limitations.
