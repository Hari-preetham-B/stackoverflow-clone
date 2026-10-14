# Deployment and commits

Deployment for this project requires access to the developer's own GitHub and hosting accounts, so
it **cannot be completed automatically**. The procedure below is the one to follow.

**Current status: deployment is pending. No public deployment URL exists yet, and none is claimed
anywhere in this documentation.**

---

## 1. Pre-deployment verification

Run all checks locally before deploying.

```powershell
# Backend tests
cd server; npm test                                  # expect 26/26

# Frontend tests
cd stack;  npm test                                  # expect 34/34

# Combined
node --test server/tests/*.test.js stack/src/lib/__tests__/*.test.ts   # expect 60/60

# TypeScript
node stack\node_modules/typescript/bin/tsc --noEmit --incremental false -p stack/tsconfig.json

# Backend syntax — run against every .js file under server/
node --check <file>

# Production build
cd stack; npm run build
```

---

## 2. Environment variables

### Backend (`server/.env`)

Create this file locally from `server/.env.example`. **Never commit it.**

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | yes | Set to `production` when deployed. `development` enables the Twilio email fallback. |
| `PORT` | no | API port. Default `5000`. Some hosts inject this automatically. |
| `MONGODB_URL` | yes | MongoDB Atlas connection string, or a local MongoDB URI. |
| `JWT_SECRET` | yes | Long random string used to sign and verify JWTs. |
| `ADMIN_EMAIL` | yes | Email address that receives the `admin` role. Reconciled on every startup. |
| `SMTP_HOST` | yes | e.g. `smtp.gmail.com` |
| `SMTP_PORT` | yes | e.g. `587` |
| `SMTP_SECURE` | yes | `false` for port 587, `true` for port 465 |
| `SMTP_USER` | yes | Sender mailbox address |
| `SMTP_PASSWORD` | yes | Google **App Password**, not the account password |
| `SMTP_FROM` | yes | From address for transactional mail |
| `RAZORPAY_KEY_ID` | yes | Razorpay key id. Use **TEST** keys until live checkout is verified. |
| `RAZORPAY_KEY_SECRET` | yes | Razorpay key secret. Server-side only. |
| `CORS_ORIGIN` | recommended | Comma-separated allowed frontend origins, e.g. `https://your-app.vercel.app`. Defaults to `http://localhost:3000` when unset. Use `*` only to allow everything. |
| `TWILIO_ACCOUNT_SID` | optional | Twilio account SID. |
| `TWILIO_AUTH_TOKEN` | optional | Twilio auth token. |
| `TWILIO_VERIFY_SERVICE_SID` | production only | **Required for phone OTP in production.** When blank in development, a documented email fallback is used instead. |

### Frontend (`stack/.env`)

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_BACKEND_URL` | yes | Public HTTPS base URL of the deployed backend, e.g. `https://your-api.onrender.com`. The `NEXT_PUBLIC_` prefix is required for browser-side access. |

---

## 3. Deploying the backend

The backend must be reachable at a **public HTTPS URL**, because the frontend calls it directly from
the browser.

1. Deploy the `server` directory to a Node host (Render, Railway, Fly.io, Cyclic, or a VPS).
2. Build command: `npm install`
3. Start command: `npm start`
4. Health check path: `/health` — it should return `{"status":"ok"}`.
5. Add **all** backend environment variables above in the host's dashboard. Do not upload a `.env`
   file.
6. Set `NODE_ENV=production`.
7. Allow the host to reach MongoDB Atlas (add the host's outbound IP to the Atlas access list if
   your cluster is IP-restricted).

On startup the server connects to MongoDB, runs the idempotent admin-role sync for `ADMIN_EMAIL`,
and then begins listening.

---

## 4. Deploying the frontend

The internship requires the frontend to be published publicly on **Vercel or Netlify**.

**Vercel**
1. Import the repository and set the **root directory** to `stack`.
2. Framework preset: Next.js (auto-detected).
3. Build command: `npm run build`
4. Start command: `npm start`
5. Add the environment variable `NEXT_PUBLIC_BACKEND_URL` pointing at the deployed backend URL.
6. Deploy.

**Netlify**
1. Add the repository and set the base directory to `stack`.
2. Build command: `npm run build`
3. Publish directory: `stack/.next` (via the Next.js runtime/plugin).
4. Add `NEXT_PUBLIC_BACKEND_URL`.
5. Deploy.

---

## 5. Required configuration relationship

The two deployed services must be configured to know about each other:

```
NEXT_PUBLIC_BACKEND_URL (frontend)  ──────►  backend public URL
CORS_ORIGIN           (backend)    ◄──────  frontend public origin
```

- `NEXT_PUBLIC_BACKEND_URL` must be the **public** backend URL, not `localhost`.
- `CORS_ORIGIN` must contain the **public** frontend origin, including the scheme, e.g.
  `https://your-app.vercel.app`.
- If either is missing or mismatched, browser requests will fail the CORS check even though the
  backend is running.

---

## 6. Post-deployment smoke test

1. Open the backend health endpoint directly: it should return `{"status":"ok"}`.
2. Open the deployed frontend and confirm it loads.
3. Sign up a new account from the deployed frontend.
4. Log in, then open Security and confirm the active session is listed.
5. Open Premium and confirm all four plans load.
6. Complete one Razorpay **TEST-mode** checkout and confirm the plan activates, the renewal date is
   set, an invoice is downloadable, and the confirmation email arrives.
7. Open `/admin` with the `ADMIN_EMAIL` account and confirm reports and login activity load.

---

## 7. Git commit procedure

All work is currently uncommitted on top of the baseline commit `d9d8145`. Review before committing.

```powershell
git status
git diff --check
git add .
git commit -m "feat: complete internship implementation, security hardening and automated tests"
git push origin main
```

For a brand-new repository:

```powershell
git init
git branch -M main
git remote add origin YOUR_GITHUB_REPOSITORY_URL
git add .
git commit -m "feat: complete internship implementation, security hardening and automated tests"
git push -u origin main
```

**Never commit** `.env`, `node_modules/`, `.next/` or `*.tsbuildinfo`. The repository `.gitignore`
already covers all of these, along with `.env.*` (with `!.env.example` so the templates stay
tracked). Confirm before committing:

```powershell
git ls-files | Select-String '\.env$|node_modules|\.next'
```

This should return nothing.

---

## 8. Important deployment notes

- No live Razorpay payment has been completed yet. Complete one TEST-mode checkout after deployment
  before switching to live keys.
- Phone OTP requires a real Twilio Verify service SID in production. Without it, `NODE_ENV=production`
  deliberately does not use the development email fallback.
- The rate limiter is in-process and correct for a single Node instance. A multi-instance deployment
  would need a shared store such as Redis.
- Responsive layout is implemented but should be confirmed on real mobile and tablet devices once
  deployed.