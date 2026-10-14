# Individual runtime test checklist

Perform these in order. Complete one item before moving to the next.
Items marked **[automated]** are also covered by the test suites and were re-verified in the final
verification run.

## 0. Basic setup
- [ ] Copy `server/.env.example` to `server/.env` and fill in MongoDB, JWT, admin email, SMTP and
      Razorpay TEST values.
- [ ] Copy `stack/.env.example` to `stack/.env`.
- [ ] Leave `TWILIO_VERIFY_SERVICE_SID` blank for local development.
- [ ] Terminal 1: `cd server`, `npm install`, `npm start`.
- [ ] Terminal 2: `cd stack`, `npm install`, `npm run dev`.
- [ ] Open `http://localhost:3000`.
- [ ] Backend health check: `http://localhost:5000/health` returns `status: ok`.

## 1. Signup
- [ ] Open `/signup`.
- [ ] Try empty fields: validation should appear.
- [ ] Try a password without a number/letter or under 8 characters: reject it.
- [ ] Create a new account; confirm redirect to home.

## 2. Logout and normal login
- [ ] Click Log out.
- [ ] Log in using the new account.
- [ ] Open Security: the current active session and login activity are visible.

## 3. Wrong-password login
- [ ] Log out, then submit the correct email with an incorrect password.
- [ ] Expected: `Invalid email or password`, no session created, failure recorded in login activity.

## 4. New-device verification
- [ ] Use a private/incognito window and log in with the same account.
- [ ] Expected: device verification page; check email for the OTP; enter it to complete login.
- [ ] Confirm the device is listed under trusted devices if "Trust this device" was selected.

## 5. Session revocation
- [ ] Revoke an active session from another browser.
- [ ] Expected: that session is rejected and redirected to login.

## 6. Forgot password by email
- [ ] Open Forgot password, enter the account email, and confirm the OTP email arrives.
- [ ] Verify the OTP, confirm the generated temporary password email, and log in with it.
- [ ] Request a reset again the same day; expect the once-per-day restriction.
- [ ] Confirm the temporary password contains letters only.

## 7. Forgot password by phone in local development
- [ ] Ensure the account has a phone number.
- [ ] Leave Twilio Verify SID blank and keep `NODE_ENV=development`.
- [ ] Request the reset using the phone number; expect the development fallback OTP by email.
- [ ] Verify it and confirm the temporary password email.
- [ ] In production this flow requires a real Twilio Verify service SID.

## 8. Ask question
- [ ] Submit a valid question with tags; confirm it is created and reputation increases.
- [ ] Repeat until the daily plan limit is reached.
- [ ] Expected: the server rejects further questions and the UI shows the backend limit message.

## 9. Question page
- [ ] Test upvote and downvote. Confirm voting on your own question is rejected.
- [ ] Test bookmark and unbookmark.
- [ ] Test Share and confirm the URL is copied.
- [ ] Test Flag and submit a reason.
- [ ] If you own the question, test Delete.

## 10. Answer
- [ ] Post an answer, vote on it, and accept it from the question owner.
- [ ] Confirm voting on your own answer is rejected.
- [ ] If you own the answer, delete it.
- [ ] Test Share and Flag on the answer.

## 11. Search
- [ ] Use the navbar search.
- [ ] With a Free account, test the Advanced search checkbox; expect server rejection.
- [ ] Repeat after an upgraded subscription is active.

## 12. Community
- [ ] Publish a text post, and a post with image URL and code.
- [ ] Like/unlike, comment, reply, share, bookmark, follow/unfollow an author.
- [ ] Edit and delete your own post.
- [ ] Confirm editing or deleting another user's post is not possible.
- [ ] Report a post; use Load more.
- [ ] Check notifications and trending.
- [ ] Test the Gold exclusive feed as Free and as Gold.

## 13. Language
- [ ] Select French and complete the email OTP.
- [ ] Select another language and complete the OTP. With no Twilio SID in development, expect the
      email fallback OTP.
- [ ] Confirm wrong OTPs are limited to five attempts.

## 14. Security
- [ ] Check active sessions and trusted devices; revoke each.
- [ ] Confirm failed-login events are listed.

## 15. Reputation
- [ ] Check the current total and privilege thresholds (50/100/250/500).
- [ ] Test transfer with an invalid receiver, above 50, and while at or below 50.
- [ ] With a valid eligible sender, test a transfer of 1–50.
- [ ] Confirm sender and receiver history entries, and public history on a profile.

## 16. Premium and Razorpay TEST mode
- [ ] Confirm all four plans and their feature lists.
- [ ] Fill in billing details and select Bronze, Silver or Gold.
- [ ] Complete a TEST-mode checkout.
- [ ] Expected: signature verification activates the plan.
- [ ] Confirm renewal date, status, billing details and payment history.
- [ ] Download the invoice and confirm the subscription confirmation email.
- [ ] Submit the same payment proof twice; expect *"Payment already verified"* on the second attempt.

## 17. Admin
- [ ] Use the account whose email matches `ADMIN_EMAIL`.
- [ ] Open `/admin`; confirm community reports, question flags and login activity are visible.
- [ ] Review/dismiss/remove a report.
- [ ] Confirm the −10 reputation penalty is applied to the content author, and only once.

## 18. Final regression
- [ ] Log out, close and reopen the browser, log in again.
- [ ] Visit Home, Questions, Tags, Users, Community, Premium, Reputation, Security and Language.
- [ ] Confirm no repeated `Session expired or revoked` toasts appear.

## 19. Automated verification (already executed)
- [x] **[automated]** `cd server && npm test` — 26/26 passed
- [x] **[automated]** `cd stack && npm test` — 34/34 passed
- [x] **[automated]** Combined run — 60/60 passed
- [x] **[automated]** TypeScript — 0 diagnostics
- [x] **[automated]** Backend syntax — 55/55 passed
- [x] **[automated]** Production Next.js build — succeeded
- [x] **[automated]** Rate limiting, CORS and security headers verified at runtime
- [x] **[automated]** Public user directory exposes no role, email or password
- [x] **[automated]** Database verified unchanged after the test run