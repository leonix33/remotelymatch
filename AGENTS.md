# AGENTS.md

## Cursor Cloud specific instructions

`remotelymatch` is a single-product monorepo with three Node packages: `backend/` (Express + Socket.IO API), `frontend/` (Vue 3 + Vite SPA/PWA), and `chrome-extension/` (auxiliary client). The Python job agent it bridges to is **not** in this repo; the backend reads bundled SQLite snapshots in `agent-data/`.

### Running the app (dev)
- `npm run dev` (from repo root) runs backend + frontend together via `concurrently`. Backend → `http://localhost:5100`, frontend (Vite) → `http://localhost:5173`. Open the frontend URL.
- Default dev login: `admin@example.com` / `ChangeThisPassword123`. Health check: `GET http://localhost:5100/api/health`.

### Required env file (non-obvious)
- The backend needs `backend/.env`. The update script creates it from `backend/.env.example` if missing. The one value that matters locally is `AGENT_HOME=/workspace/agent-data` — without it, `AGENT_HOME` defaults to `/` and the Jobs/Applications pages show no data even though everything else works. `backend/.env` is gitignored; never commit it.
- Leave `MONGODB_URI` empty to run in **SQLite-only mode** (lightest E2E path): login uses the `.env` admin creds and Jobs/Applications are read directly from `agent-data/*.db`. Set `MONGODB_URI` (e.g. `npm run mongo:up` → `mongodb://127.0.0.1:27018/remotelymatch`) only to exercise persistence/admin/teams features. All other integrations (OpenAI, Resend email, Web-Push, Adzuna) degrade gracefully when their keys are absent — the dashboard is fully usable in "demo mode" without them.

### Lint / test / build
- Lint: `npm run lint` is effectively a no-op (frontend has no lint script; it falls back to `true`).
- Test: `npm test` runs the backend suite (`node --test src/tests/*.test.js`). Note: one test, `interviewLikelihood.test.js → "builds minimum 3 supplement pages in demo mode"`, fails deterministically due to a pre-existing logic issue in `buildDemoKit` (unrelated to environment setup).
- Build (frontend prod bundle): `npm run build`. Production serve: `npm start` (backend serves `frontend/dist`).

### Notes
- Node 22 is installed and works (the Dockerfile pins Node 20). `better-sqlite3` is a native module but installs via prebuilt binaries — no compile toolchain needed.
- In SQLite-only mode the onboarding page may show a "saved resume is broken file data" warning; this is expected (no persisted resume) and not an error.
