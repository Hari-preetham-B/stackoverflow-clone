# Git commits and deployment

## Commit sequence
Run these from the project root after copying the final project and confirming the local tests.

```powershell
git status
git add .
git commit -m "feat: complete internship implementation and functional UI"
git push origin main
```

If this is a new repository:

```powershell
git init
git branch -M main
git remote add origin YOUR_GITHUB_REPOSITORY_URL
git add .
git commit -m "feat: complete internship implementation and functional UI"
git push -u origin main
```

Do not commit `.env`, `node_modules`, or `.next`. The included `.gitignore` is configured for these.

## Recommended deployment split

### Backend
Deploy the `server` directory as a Node service.
- Build/install: `npm install`
- Start: `node index.js`
- Health check: `/health`
- Set all backend environment variables in the host dashboard.
- Use `NODE_ENV=production`.
- For production phone OTP, provide a real Twilio Verify Service SID.

### Frontend
Deploy the `stack` directory as a Next.js service.
- Build: `npm run build`
- Start: `npm start`
- Set `NEXT_PUBLIC_BACKEND_URL` to the deployed backend URL.

After deployment, test `/health` on the backend and then test signup/login from the deployed frontend.

The project cannot be deployed into your hosting accounts automatically because that requires access to your GitHub/hosting accounts.
