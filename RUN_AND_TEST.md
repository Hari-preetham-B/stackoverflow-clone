# Run and Test

## Setup

1. Copy `server/.env.example` to `server/.env` and fill in the MongoDB, JWT, admin email, Gmail SMTP
   and Razorpay TEST values. `TWILIO_VERIFY_SERVICE_SID` can remain blank during development.
2. Optionally set `CORS_ORIGIN` to your frontend origin. When unset it defaults to
   `http://localhost:3000`.
3. Copy `stack/.env.example` to `stack/.env` and set `NEXT_PUBLIC_BACKEND_URL=http://localhost:5000`.
4. In `server`: `npm install` then `npm start` (or `npm run dev` for nodemon reload).
5. In `stack`: `npm install` then `npm run dev`.
6. Open `http://localhost:3000`.
7. Backend health check: open `http://localhost:5000/health` and confirm `status: ok`.

## Automated tests

```powershell
cd server; npm test     # 26 tests
cd stack;  npm test     # 34 tests

# from the project root, runs both suites
node --test server/tests/*.test.js stack/src/lib/__tests__/*.test.ts   # 60 tests

# type check
node stack/node_modules/typescript/bin/tsc --noEmit --incremental false -p stack/tsconfig.json
```

## Test order

1. Sign up with a new email and password.
2. Log out.
3. Log in again from the same browser. Open **Security** and confirm the active session and login
   activity are listed.
4. Log in with a wrong password and confirm `Invalid email or password`; no session should be created
   and the failure should appear in login activity.
5. Log in from a private/incognito window and complete the email device OTP flow. Confirm the device
   appears under trusted devices if "Trust this device" was selected.
6. **Session revocation** — revoke a session from another browser and confirm it is rejected and
   redirected to login.
7. **Forgot password** — request the OTP, verify it, confirm the generated temporary password email,
   then log in with that password. Request a reset again the same day and confirm the once-per-day
   restriction.
8. **Phone forgot-password fallback** — with a phone number on the account, blank Twilio SID and
   `NODE_ENV=development`, request the reset and confirm the development fallback OTP arrives by
   email.
9. **Ask question** — post a question with tags and confirm the daily limit is enforced. Submitting
   past the limit shows the backend's limit message.
10. **Question page** — test upvote and downvote (including that self-voting is rejected), bookmark
    and unbookmark, Share, and Flag with a reason. If you own the question, test Delete.
11. **Answer** — post an answer, vote on it, accept it from the question owner, and delete it if you
    own it. Test Share and Flag.
12. **Search** — search from the navbar. With a Free account, confirm Advanced search is rejected by
    the server. Repeat on an upgraded plan.
13. **Community** — publish a text post and a post with an image URL and code; like, comment, reply,
    share, bookmark, follow/unfollow an author, edit your own post, delete it, report a post, and use
    Load more. Confirm notifications and trending. Confirm the Gold exclusive feed is rejected for a
    Free account and available for Gold.
14. **Language** — select French and complete the email OTP. Select another language and complete the
    OTP; with no Twilio SID in development this arrives by email as a documented fallback.
15. **Security** — review active sessions and trusted devices, revoke each, and confirm failed-login
    events are present.
16. **Reputation** — check the current total and privilege thresholds, test a transfer with an
    invalid receiver, above 50, and while at or below 50, then a valid transfer of 1–50. Confirm both
    sender and receiver history entries, and the public history on a profile.
17. **Premium and Razorpay TEST mode** — confirm all four plans, fill billing details, and complete a
    TEST-mode checkout for Bronze, Silver and Gold. Confirm the plan activates, then verify renewal
    date, status, billing details, payment history, invoice download and the confirmation email.
    Submit the same payment proof twice and confirm the second attempt is rejected with
    *"Payment already verified"*.
18. **Admin** — use the account whose email matches `ADMIN_EMAIL`. Open `/admin`, confirm community
    reports, question flags and login activity, then review/dismiss/remove a report and confirm the
    −10 reputation penalty is applied to the content author exactly once.
19. **Final regression** — log out, reopen the browser, log in again, then visit Home, Questions,
    Tags, Users, Community, Premium, Reputation, Security and Language. Confirm no repeated
    "Session expired or revoked" toasts appear.

## Notes

- Rate limiting is active on login, password reset, password OTP, new-device verification and
  language OTP. Repeated failed attempts return HTTP 429; this is expected behaviour, not a defect.
- A malformed route identifier returns HTTP 400 with a clear message.

## Deployment

Backend: deploy `server` as a Node service with `npm start`. Frontend: deploy `stack` as a Next.js
service with `npm run build` and `npm start`. Set production environment variables on the hosting
platform, including `CORS_ORIGIN` for the deployed frontend origin. Full procedure in
[DEPLOYMENT_AND_COMMITS.md](DEPLOYMENT_AND_COMMITS.md).