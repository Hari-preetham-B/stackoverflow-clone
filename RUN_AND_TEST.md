# Run and Test

## Setup
1. Copy `server/.env.example` to `server/.env` and fill the MongoDB, JWT, Gmail SMTP and Razorpay values. Twilio Verify SID can remain blank during email-based testing.
2. Copy `stack/.env.example` to `stack/.env` and set `NEXT_PUBLIC_BACKEND_URL=http://localhost:5000`.
3. In `server`: `npm install` then `npm start`.
4. In `stack`: `npm install` then `npm run dev`.
5. Open `http://localhost:3000`.

## Test order
1. Sign up with a new email and password.
2. Log out.
3. Log in again from the same browser.
4. Log in with a wrong password and verify the error.
5. Log in from a fresh browser/private window and verify the email device OTP flow.
6. Test forgot password: request OTP, verify OTP, check generated password email, then log in with the generated password.
7. Create a question and verify the free daily limit.
8. Open a question, vote, bookmark, share, flag, post an answer, vote on the answer and accept it from the question owner.
9. Test search and advanced-search gating.
10. Test community post, like, comment, reply, share, bookmark, follow, edit, delete, report and pagination.
11. Test language change: French through email OTP. Other languages require Twilio Verify SID and a phone number.
12. Test security sessions, trusted devices, revocation and login activity.
13. Test reputation history and transfer limits.
14. Test Razorpay in TEST mode for each paid plan and download an invoice after a successful payment.
15. Test admin moderation and admin login activity using an account whose email matches `ADMIN_EMAIL`.

## Deployment
Backend: deploy `server` as a Node service with `node index.js`. Frontend: deploy `stack` as a Next.js service with `npm run build` and `npm start`. Set production environment variables on the hosting platform.
