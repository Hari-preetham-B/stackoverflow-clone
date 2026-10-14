# Individual runtime test checklist

Perform these in order. Complete one item before moving to the next.

## 0. Basic setup
- Copy `server/.env.example` to `server/.env`.
- Copy `stack/.env.example` to `stack/.env`.
- Put in your real MongoDB URL, JWT secret, Gmail SMTP/App Password and Razorpay TEST credentials.
- Leave `TWILIO_VERIFY_SERVICE_SID` blank for local development if you do not have it.
- Terminal 1: `cd server`, `npm install`, `npm start`.
- Terminal 2: `cd stack`, `npm install`, `npm run dev`.
- Open `http://localhost:3000`.
- Backend health check: open `http://localhost:5000/health` and confirm `status: ok`.

## 1. Signup
- Open `/signup`.
- Try empty fields: validation should appear.
- Try a password without a number/letter or under 8 characters: reject it.
- Create a new account.
- Expected: signup success and redirect to home.

## 2. Logout and normal login
- Click Log out.
- Log in using the new account.
- Expected: successful login and redirect to home.
- Open Security.
- Expected: current active session and login activity are visible.

## 3. Wrong-password login
- Log out.
- Enter the correct email and an incorrect password.
- Expected: `Invalid email or password`.
- No session should be created.

## 4. New-device verification
- Use a private/incognito browser window.
- Log in with the same account.
- Expected: device verification page.
- Check Gmail for the OTP.
- Enter the OTP.
- Expected: successful login.
- Security page should show the trusted device if Trust this device was selected.

## 5. Session revocation
- Open Security.
- Revoke an active session from another browser if available.
- Expected: that session is rejected and redirected to login.

## 6. Forgot password by email
- Open Forgot password.
- Enter the account email.
- Check Gmail for OTP.
- Enter OTP.
- Check Gmail for the generated temporary password.
- Log in using that temporary password.
- Expected: successful login.
- Request the email reset again the same day.
- Expected: once-per-day restriction.

## 7. Forgot password by phone in local development
- Ensure the account has a phone number.
- Leave Twilio Verify SID blank and keep `NODE_ENV=development`.
- Request reset using the phone number.
- Expected: development fallback OTP arrives by email.
- Verify it and confirm the temporary password email.
- In production, this flow requires Twilio Verify.

## 8. Ask question
- Open Ask Question.
- Submit a valid question with tags.
- Expected: question is created and reputation increases by the configured amount.
- Repeat until the Free daily limit is reached.
- Expected: server rejects additional questions for that day.

## 9. Question page
- Open the created question.
- Test upvote and downvote.
- Test bookmark and unbookmark.
- Test Share and confirm the URL is copied.
- Test Flag and submit a reason.
- If you own the question, test Delete.

## 10. Answer
- Open another question.
- Post an answer.
- Vote on the answer.
- If you own the question, accept the answer.
- If you own the answer, delete it.
- Test Share and Flag on the answer.

## 11. Search
- Use the navbar search.
- Search for an existing question.
- Test the Advanced search checkbox on a Free account.
- Expected: server rejects advanced search.
- Repeat after a Bronze/Silver/Gold subscription is active.

## 12. Community
- Open Community.
- Publish a text post.
- Publish a post with image URL and code.
- Like/unlike.
- Comment.
- Reply.
- Share.
- Bookmark.
- Follow/unfollow an author.
- Edit your own post.
- Delete your own post.
- Report a post.
- Load more.
- Check notifications.
- Check trending.
- Test Gold exclusive as Free and as Gold.

## 13. Language
- Open Language.
- Select French.
- Request OTP and verify through email.
- Expected: navigation labels change immediately.
- Select Hindi/Spanish/Portuguese/Chinese.
- With no Twilio SID in development, expected: email fallback OTP.
- With Twilio configured, expected: mobile OTP.

## 14. Security
- Check active sessions.
- Check trusted devices.
- Revoke a trusted device.
- Check login activity.
- Confirm failed-login events appear after the wrong-password test.

## 15. Reputation
- Open Reputation.
- Check current reputation and privilege thresholds.
- Test transfer with an invalid receiver.
- Test transfer above 50.
- Test transfer when sender is at or below 50.
- With a valid eligible sender, test a transfer of 1-50.
- Confirm sender and receiver history entries.
- Open a user's profile and verify public reputation history.

## 16. Premium and Razorpay TEST mode
- Open Premium.
- Confirm all four plans and their feature lists.
- Fill billing address.
- Select Bronze, Silver or Gold.
- Use Razorpay TEST mode.
- Complete the test checkout.
- Expected: signature verification activates the selected plan.
- Confirm renewal date, status, billing details and payment history.
- Download the invoice.
- Confirm the subscription confirmation email.

## 17. Admin
- Register an account whose email matches `ADMIN_EMAIL`.
- Open `/admin`.
- Confirm community reports, question flags and login activity are visible.
- Review/dismiss/remove a report.
- Confirm the moderation result in the relevant content.

## 18. Final regression
- Log out.
- Close and reopen the browser.
- Log in again.
- Visit Home, Questions, Tags, Users, Community, Premium, Reputation, Security and Language.
- Confirm no repeated `Session expired or revoked` toasts appear.
