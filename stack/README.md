# CodeQuest — Frontend (`stack/`)

This directory holds the **React 19 + Next.js 16 (Pages Router)** frontend of the CodeQuest Stack
Overflow clone.

> Full project documentation, including the internship feature set, setup, deployment and known
> limitations, is in the [root README](../README.md).

## Stack

- React 19, Next.js 16 (Pages Router), TypeScript
- Tailwind CSS 4 via `@tailwindcss/postcss` (`postcss.config.mjs`, `src/styles/globals.css`)
- shadcn/ui primitives in `src/components/ui` (button, card, input, label, textarea, badge, avatar,
  dialog, checkbox) configured by `components.json`
- `lucide-react` icons, `react-toastify` notifications
- Axios through a single configured instance in `src/lib/axiosinstance.js`

## Structure

```
src/
├── pages/            Route components (auth, ask, questions, community, subscription,
│                     reputation, security, settings/language, users, admin, …)
├── components/       Navbar, Sidebar, RightSideBar, QuestionDetail, ui/
├── layout/           Mainlayout (Navbar + Sidebar + content + RightSideBar)
└── lib/
    ├── AuthContext.js        Login state, signup, logout, device verification
    ├── LanguageContext.js    Active language, `t()` translation helper
    ├── axiosinstance.js      Base URL + Bearer token + 401 interceptor
    ├── utils.ts              `cn()`, `escapeHtml()`, `renderQuestionBody()`
    └── __tests__/            node:test suite
```

## Getting started

```powershell
npm install
Copy-Item .env.example .env     # set NEXT_PUBLIC_BACKEND_URL=http://localhost:5000
npm run dev                     # http://localhost:3000
```

`NEXT_PUBLIC_BACKEND_URL` must be prefixed with `NEXT_PUBLIC_` because it is read in the browser.
It must point at a **reachable** backend URL — `localhost` during development, the public HTTPS
backend URL once deployed.

## Tests

```powershell
npm test    # 34 tests via Node's built-in node:test runner
```

Covers the XSS rendering boundary (`escapeHtml`, `renderQuestionBody`), 15 representative injection
payloads, Markdown fidelity and escaping invariants.

## Type check and production build

```powershell
node node_modules/typescript/bin/tsc --noEmit --incremental false -p tsconfig.json
npm run build
npm start
```

## Notes

- User-supplied question and answer bodies are HTML-escaped before rendering. The only tags that
  reach the DOM are those emitted by the renderer (`p`, `h3`, `code`, `pre`, `ol`, `li`).
- A 401 response clears local auth state and redirects to the login page automatically.
- CORS on the backend must allow this app's origin — see `CORS_ORIGIN` in the root README.