# remotelymatch

A full-stack remote job dashboard built with the **Vue → Express → MongoDB** pattern from the Business Dashboard Master Guide — wired to your existing Python job agent.

## Product naming

| What | Value |
|------|--------|
| **Product name** | `remotelymatch` |
| **Domain** | `remotelymatch.app` |
| **GitHub repo** | `remotelymatch` |
| **npm packages** | `remotelymatch`, `remotelymatch-frontend`, `remotelymatch-backend` |
| **Legacy Render URL** | `remotematch.onrender.com` (infra slug — still works, redirects not required) |
| **Legacy typo domain** | `remotematch.app` → 301 to `remotelymatch.app` |

Canonical constants live in `frontend/src/constants/domain.js` and `backend/src/constants/brand.js`.

## What it does

- **Jobs** — Browse matched remote roles synced from `seen_jobs.db`
- **Applications** — Track auto-apply status from `application_tracker.db`
- **Run Agent** — Trigger `run_search_and_apply.sh` from the UI
- **Cover Letter** — OpenAI-powered application copy (demo mode without API key)
- **Analytics** — Pipeline counts and status breakdowns
- **Users** — Admin user management (requires MongoDB)

## Architecture

```
Vue View → Axios → Express route → Controller → Service → MongoDB / SQLite → JSON → Vue
```

| Layer | Tech |
|-------|------|
| Frontend | Vue 3, Vite, Tailwind, Pinia, Axios |
| Backend | Node.js, Express, Mongoose |
| Agent bridge | better-sqlite3 reads Python agent DBs |
| AI | OpenAI API |
| Deploy | Docker, Render |

## Your live app URL

**Production:** [https://remotelymatch.app](https://remotelymatch.app)  
**Render host:** [https://remotematch.onrender.com](https://remotematch.onrender.com) (legacy; custom domain is canonical)

Local dev still uses `localhost`. Production canonical domain is `remotelymatch.app` — set in `render.yaml` and `frontend/.env.production`.

| Environment | URL |
|-------------|-----|
| Local dev | http://localhost:5173 |
| Production | https://remotelymatch.app |

## Keep production in sync with your Mac

Localhost reads live SQLite from `job-event-agent`. Production reads a **snapshot** bundled in Docker (`agent-data/`).

After your agent finds new jobs or applies to roles, run:

```bash
npm run deploy:data
```

This copies your latest `seen_jobs.db` and `application_tracker.db`, commits them, and pushes to GitHub. Render auto-deploys in ~5 minutes.

**Login on production:** use the `ADMIN_EMAIL` and `ADMIN_PASSWORD` from your Render dashboard.

## Quick start (local)

```bash
cd remotelymatch
npm install
cd frontend && npm install && cd ..
cd backend && npm install && cd ..

cp backend/.env.example backend/.env
# Edit backend/.env — set AGENT_HOME to your job-event-agent path
```

### SQLite-only mode (no MongoDB)

Leave `MONGODB_URI` empty. Login uses `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`. Jobs and applications read directly from the Python agent SQLite databases.

### With MongoDB Atlas

Set `MONGODB_URI` for persistent users, generations, and agent run history.

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend health: http://localhost:5100/api/health

Default login (from `.env`):

- Email: `admin@example.com`
- Password: `ChangeThisPassword123`

## Deploy to Render (get the real URL)

1. Push this folder to GitHub (repo name: `remotelymatch`)
2. Go to [render.com](https://render.com) → **New** → **Blueprint** or **Web Service**
3. Connect the GitHub repo
4. Render reads `render.yaml` — service slug `remotematch` (legacy) → `https://remotematch.onrender.com`; canonical domain is **remotelymatch.app**
5. Add secrets in Render **Environment**:
   - `MONGODB_URI` (MongoDB Atlas)
   - `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` (long random strings)
   - `ADMIN_EMAIL` / `ADMIN_PASSWORD`
   - `OPENAI_API_KEY` (optional)
   - Or use **HashiCorp Vault** (open source, self-hosted):
     - `SECRETS_PROVIDER=hashicorp-vault`
     - `VAULT_ADDR=https://vault.example.com`
     - `VAULT_TOKEN=<app-token>`
     - `VAULT_SECRET_PATH=remotelymatch`
   - Or **Azure Key Vault**:
     - `SECRETS_PROVIDER=azure-key-vault`
     - `AZURE_KEY_VAULT_URL=https://<your-vault>.vault.azure.net/`
6. Deploy — first build takes ~5 minutes
7. Open **https://remotematch.onrender.com** and log in

To use a custom domain later: Render → Settings → Custom Domains → e.g. `remotelymatch.app`

## Production

```bash
npm run build
npm start
```

### Docker

```bash
docker build -t remotelymatch .
docker run --env-file backend/.env -p 5100:5100 remotelymatch
```

## Environment variables

| Variable | Purpose |
|----------|---------|
| `MONGODB_URI` | MongoDB Atlas connection (optional locally) |
| `JWT_ACCESS_SECRET` | JWT signing secret |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | First admin / dev login |
| `OPENAI_API_KEY` | Cover letter generation |
| `AGENT_HOME` | Path to job-event-agent folder |
| `CLIENT_ORIGIN` | CORS origin (Render URL in production) |
| `SECRETS_PROVIDER` | `env` (default), `hashicorp-vault`, or `azure-key-vault` |
| `VAULT_ADDR` | HashiCorp Vault URL (open source) |
| `VAULT_TOKEN` | Vault token with read access to app secrets |
| `VAULT_SECRET_PATH` | KV path holding all app secrets (default `remotelymatch`) |
| `AZURE_KEY_VAULT_URL` | Azure vault URL (optional alternative) |

### Key vault (open source — recommended)

Use **HashiCorp Vault** (or [OpenBao](https://openbao.org/), the open-source fork) to keep API keys out of Render env vars.

1. Run Vault (dev example):
   ```bash
   docker run --cap-add=IPC_LOCK -e VAULT_DEV_ROOT_TOKEN_ID=dev-token -p 8200:8200 hashicorp/vault server -dev
   ```
2. Enable KV v2 and write one secret object:
   ```bash
   export VAULT_ADDR=http://127.0.0.1:8200
   export VAULT_TOKEN=dev-token
   vault kv put secret/remotelymatch \
     OPENAI_API_KEY=sk-... \
     APOLLO_API_KEY=... \
     HUNTER_API_KEY=... \
     RESEND_API_KEY=...
   ```
3. Set on Render:
   - `SECRETS_PROVIDER=hashicorp-vault`
   - `VAULT_ADDR=https://your-vault-host`
   - `VAULT_TOKEN=<least-privilege-token>`
   - `VAULT_SECRET_PATH=remotelymatch`

The backend loads vault secrets at startup before reading config. Existing env vars win if already set (handy for local dev).

### Azure Key Vault (optional)

The backend can hydrate secrets from Azure Key Vault before app boot.

1. Create secrets in Azure Key Vault (defaults use env names lowercased with `-`, e.g. `openai-api-key`, `apollo-api-key`, `hunter-api-key`).
2. Grant your runtime identity access to `get` secrets.
3. Set:
   - `SECRETS_PROVIDER=azure-key-vault`
   - `AZURE_KEY_VAULT_URL=https://<your-vault>.vault.azure.net/`
4. Keep local `.env` values blank for keys managed in vault.

If a vault secret has a different name, map it with:
- `AZURE_KV_OPENAI_API_KEY_NAME`
- `AZURE_KV_APOLLO_API_KEY_NAME`
- `AZURE_KV_HUNTER_API_KEY_NAME`

## Ports

| Port | Service |
|------|---------|
| 5173 | Vite dev server |
| 5100 | Express API |

## Install on mobile (PWA)

remotelymatch is a **Progressive Web App** — you can install it on your phone like a native app.

### iPhone (Safari)
1. Deploy to HTTPS (Render) or use local network testing
2. Open the site in **Safari**
3. Tap **Share** → **Add to Home Screen**
4. Name it **remotelymatch** and tap **Add**

### Android (Chrome)
1. Open the deployed HTTPS URL in **Chrome**
2. Tap **Install app** when prompted, or use the in-app **Install** banner
3. The app opens from your home screen

### What works offline
- App shell and cached pages load without network
- API calls need internet — you'll see the offline page when disconnected

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Login fails | Check `.env` credentials; password must be 8+ chars |
| No jobs shown | Confirm `AGENT_HOME` points to job-event-agent with `seen_jobs.db` |
| Agent run fails | Ensure `run_search_and_apply.sh` exists and is executable |
| MongoDB errors | Set `MONGODB_URI` or leave empty for SQLite-only mode |
