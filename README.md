# RemoteMatch

A full-stack remote job dashboard built with the **Vue → Express → MongoDB** pattern from the Business Dashboard Master Guide — wired to your existing Python job agent.

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
cd remotematch
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

1. Push this folder to GitHub (repo name: `remotematch`)
2. Go to [render.com](https://render.com) → **New** → **Blueprint** or **Web Service**
3. Connect the GitHub repo
4. Render reads `render.yaml` — service name `remotematch` → URL `https://remotematch.onrender.com`
5. Add secrets in Render **Environment**:
   - `MONGODB_URI` (MongoDB Atlas)
   - `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` (long random strings)
   - `ADMIN_EMAIL` / `ADMIN_PASSWORD`
   - `OPENAI_API_KEY` (optional)
6. Deploy — first build takes ~5 minutes
7. Open **https://remotematch.onrender.com** and log in

To use a custom domain later: Render → Settings → Custom Domains → e.g. `remotematch.app`

## Production

```bash
npm run build
npm start
```

### Docker

```bash
docker build -t remotematch .
docker run --env-file backend/.env -p 5100:5100 remotematch
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

## Ports

| Port | Service |
|------|---------|
| 5173 | Vite dev server |
| 5100 | Express API |

## Install on mobile (PWA)

RemoteMatch is a **Progressive Web App** — you can install it on your phone like a native app.

### iPhone (Safari)
1. Deploy to HTTPS (Render) or use local network testing
2. Open the site in **Safari**
3. Tap **Share** → **Add to Home Screen**
4. Name it **RemoteMatch** and tap **Add**

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
