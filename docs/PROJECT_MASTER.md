# remotelymatch — Master Project Brief

> **Purpose of this document:** Paste into a ChatGPT Project (or Claude Project) as the single source of truth. Use it to plan builds, debug issues, write copy, and drive the job-search mission: **get interviews through the app.**

---

## 1. Mission & North Star

### What remotelymatch is

A **full-stack remote job operations platform** — not a job board. It ingests roles from 24+ sources, scores them to your resume, lets you **approve before auto-apply**, generates tailored application kits, and manages follow-ups until you land interviews.

### Product wedge (vs market)

> **Approve-then-apply with tailored kits and follow-ups — automation you control.**

| Competitor type | They win on | We win on |
|-----------------|-------------|-----------|
| LinkedIn / Indeed | Inventory, trust | Match + workflow |
| Teal / Huntr | Planning UX | Execution (agent applies) |
| Simplify / LazyApply | Volume auto-apply | Human approval gate + follow-ups |

### PMF definition

> A user uploads a resume → sees strong matches → approves jobs → applications go out → **at least one interview in 14 days** → they return next week.

### North-star metrics

| Metric | Target |
|--------|--------|
| Time to first match after resume | < 2 min |
| % users approving ≥1 job in session 1 | > 50% |
| Applications sent / active user / week | ≥ 5 |
| Recruiter reply rate | ≥ 10% |
| Interviews / active user / month | ≥ 1 |
| Week-2 retention | > 40% |

---

## 2. Live URLs & Repos

| Item | Value |
|------|--------|
| **Production** | https://remotelymatch.app |
| **Render host (legacy)** | https://remotematch.onrender.com |
| **GitHub** | `leonix33/remotelymatch` → branch `main` |
| **Canonical repo path (Mac)** | `/Users/user/job-event-agent/remotelymatch` |
| **Python agent home (local)** | `/Users/user/job-event-agent` |
| **Wrong folder (job-fetcher only)** | `/Users/user/remote-job-agent` — not the web app |

### Local dev

```bash
cd /Users/user/job-event-agent/remotelymatch
npm run mongo:up          # Docker Mongo on 27018
npm run dev               # backend :5100, frontend :5173
npm run local:check       # verify health + login
```

Login: `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `backend/.env` (currently `leonix23@gmail.com`).

---

## 3. Architecture A → Z

### Stack

```
Vue 3 + Vite + Pinia + Tailwind + PWA
        ↓ Axios (/api proxy)
Express + Socket.IO + JWT auth
        ↓
Mongoose → MongoDB Atlas (users, jobs, queue, kits, outcomes)
        ↓
better-sqlite3 → Python agent DBs (seen_jobs.db, application_tracker.db)
        ↓
Python scripts (run_search_and_apply.sh, auto_apply.py) — LOCAL MAC ONLY
```

### Directory map

```
remotelymatch/
├── frontend/src/          Vue SPA
│   ├── views/             Pages (Dashboard, Approvals, Follow-ups, etc.)
│   ├── components/        UI building blocks
│   ├── stores/            Pinia (auth, profile, notifications, socket)
│   ├── router/index.js    Routes + guards
│   ├── api/http.js        Axios + 401 interceptor
│   └── utils/navigation.js  Core nav: Apply, Queue, Follow-ups, Profile
├── backend/src/
│   ├── routes/            29 API route groups
│   ├── controllers/       Request handlers
│   ├── services/          Business logic
│   ├── models/            30 Mongoose schemas
│   ├── middleware/        JWT auth, Mongo gate
│   ├── config/            env, db, jobSources
│   └── index.js           Bootstrap, crons, admin sync
├── chrome-extension/      LinkedIn → queue ingest
├── agent-data/            Production SQLite snapshot (deployed in Docker)
├── scripts/               Dev, deploy, sync, email setup
├── render.yaml            Render Blueprint
└── Dockerfile             Multi-stage build
```

### Data flow: job → interview

```
24 job sources (fetchers)
  → jobIngestService (normalize, dedupe, enrich)
  → MongoDB Job collection
  → jobScoringService + profile match
  → Dashboard "Top Matches" + Jobs browse
  → User approves → JobApproval queue
  → applicationKitService (tailored resume + cover)
  → agent apply (local Python) OR manual
  → Application tracked
  → followUpScheduleService (draft email, enrich contacts)
  → Outcome logged (reply, interview, offer)
```

### Auth

| Flow | Endpoints | Notes |
|------|-----------|-------|
| Login | `POST /api/auth/login` | JWT 7d, stored in localStorage |
| Passkey | `/api/auth/passkey/*` | Face ID / fingerprint (Mongo required) |
| Forgot password | `/api/auth/forgot-password` → code email | Mongo required |
| Reset | `/api/auth/reset-password-code` or `?reset=token` | |
| Extension | `POST /api/auth/extension-token` | 90d JWT for Chrome ext |

Guest pages (no app shell): `/login`, `/forgot-password`, `/welcome`, `/privacy`, `/terms`.

### Core user nav (4-step interview funnel)

| Step | Route | View | Action |
|------|-------|------|--------|
| 1 Resume | `/` or `/onboarding` | DashboardView / OnboardingView | Upload resume, parse profile |
| 2 Matches | `/` | TopMatchJobsPreview | See scored jobs |
| 3 Apply | `/` | useQuickApply | Queue top N matches |
| 4 Queue | `/approvals` | ApprovalsView | Review kits, approve, agent apply |
| Follow-up | `/follow-ups` | FollowUpView | Send recruiter emails |
| Profile | `/profile` | ProfileView | Settings, keys, password |

### Admin nav (de-prioritize until PMF)

| Route | Purpose |
|-------|---------|
| `/monitor/*` | Observability (pipeline, agent, who) |
| `/users` | Team invites, password reset |
| `/agent` | Run Python search agent |
| `/analytics` | Pipeline stats |

### Job sources (24 fetchers)

remoteok, remotive, jobicy, himalayas, weworkremotely, greenhouse, lever, ashby, jungle, roberthalf, arbeitnow, jobspresso, fourdayweek, landingjobs, wellfound, dice, indeed, adzuna, workingnomads, devitjobs, aijobs, ycombinator, workatastartup, usajobs

Config: `backend/src/config/jobSources.js`. All sources on by default; limit with `JOB_SOURCES_ENABLED`.

### Deploy

| Step | Command |
|------|---------|
| Push code | `git push origin main` → Render auto-deploy ~5 min |
| Sync agent data | `npm run deploy:data` (SQLite snapshot → git → push) |
| Health check | `GET https://remotelymatch.app/api/health` |
| Post-deploy | `npm run refresh:production` |

**Production limitation:** Python auto-apply scripts run on **local Mac only**. Render has read-only SQLite snapshot. Apply flow on production generates kits but agent apply must run locally OR architecture must change.

### Key env vars

See `backend/.env.example`. Critical:

- `MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`
- `AGENT_HOME` (local: `/Users/user/job-event-agent`, prod: `/app/agent-data`)
- `OPENAI_API_KEY` (tailoring, interview prep)
- `GMAIL_SMTP_USER/PASS` or `RESEND_API_KEY` (email)
- `HUNTER_API_KEY`, `APOLLO_API_KEY` (recruiter enrichment)
- `VAPID_*` (web push)

---

## 4. Personal Playbook — Get Interviews Using This App

Use this weekly loop. ChatGPT should coach you through these steps.

### Daily (15 min)

1. Open https://remotelymatch.app (or localhost:5173)
2. Check **Apply** dashboard → new top matches
3. Approve 2–3 high-score jobs into **Queue**
4. Preview application kit (resume snippet + cover line) before approving
5. Run apply (local agent if on Mac)

### Weekly (60 min)

| Day | Task |
|-----|------|
| Mon | Upload/refresh resume if needed. Run job ingest or agent search. |
| Tue–Thu | Approve 5–10 jobs. Send follow-ups on prior applications. |
| Fri | Review outcomes. Log recruiter replies. Adjust target titles/skills in Profile. |
| Weekend | Interview prep (`/interview`) for any callbacks |

### Approval checklist (before you approve a job)

- [ ] Match score makes sense for your target role
- [ ] Remote / location fits
- [ ] Kit preview reads human (not generic AI slop)
- [ ] Company is not a clear mismatch (wrong seniority, wrong stack)

### Follow-up timing

| After | Action |
|-------|--------|
| Apply + 3 days | First follow-up email (Follow-ups tab) |
| Apply + 7 days | Second touch or LinkedIn message |
| Recruiter reply | Log outcome, move to interview prep |

### Chrome extension

Install from `chrome-extension/`. On LinkedIn job pages → queue to approvals. Connect token from Profile → Extension.

### When production apply doesn't work

Run apply from local Mac:

```bash
cd /Users/user/job-event-agent/remotelymatch
npm run dev
# Approve jobs in UI, then agent apply runs against live AGENT_HOME
```

---

---

## 6-month strategy (north star)

For the next six months, build **almost exclusively** on these six pillars. Each maps to existing services in the repo.

| Pillar | Goal | Key services / views |
|--------|------|----------------------|
| **1. Job matching** | Fewer bad matches, clear "why" | `jobScoringService`, `TopMatchJobsPreview`, `JobsView` |
| **2. Resume tailoring** | ATS-safe, human-sounding per-job kits | `resumeTailorService`, `applicationKitService`, `atsKeywordService` |
| **3. Recruiter targeting** | Right person, ranked contacts | `contactEnrichmentService`, `contactRankingService`, `recruiterContactService` |
| **4. Follow-up automation** | Timed drafts, one-tap send | `followUpDraftService`, `followUpSendService`, `weeklyPulseService` |
| **5. Interview preparation** | Per-job prep pack | `interviewService`, `InterviewView` |
| **6. Outcome learning** | Reply/interview/offer → better match + tailor | `outcomeService`, `conversionStatsService`, `OutcomesView` |

**Month 1–3:** Pillars 1–2 + Tier 0 trust. **Month 2–4:** Pillars 3–4. **Month 3–5:** Pillars 5–6. **Month 6:** Case study, beta users, then growth (Tier 3).

See [ROADMAP.md](../ROADMAP.md) for the full 6-month calendar.

---

## 5. PMF Build Roadmap — Tier 0 → Tier 3

**Rule:** If it doesn't help get an interview in 7 days, it waits.

### Tier 0 — Trust & reliability (Week 1)

| ID | Build | Done when |
|----|-------|-----------|
| T0-1 | Forgot password works mobile + web | User resets password end-to-end |
| T0-2 | PWA cache bust / "Update available" reload | No stale bundles after deploy |
| T0-3 | First-5-min smoke test documented | Fresh account: resume → match → queue |
| T0-4 | Stable `npm run dev` | `local:check` all green |
| T0-5 | Onboarding CTA: "Add to queue" | One obvious next step after matches |
| T0-6 | Empty states on queue, matches, follow-ups | Never a blank screen |

### Tier 1 — Core loop proof (Week 2–3)

| ID | Build | Done when |
|----|-------|-----------|
| T1-1 | "Why this job" on every match card | User understands score |
| T1-2 | One-tap approve from match list | < 3 taps to queue |
| T1-3 | Kit preview before approve | User sees tailored snippet |
| T1-4 | Outcome tracker: Applied → Reply → Interview → Offer | Data in `/outcomes` or profile |
| T1-5 | Weekly digest email | "5 matches, 2 to approve, 1 follow-up due" |
| T1-6 | Chrome extension polish | LinkedIn → queue in 2 clicks |

**Tier 1 success:** 10 approved apps/week → ≥1 recruiter response in 14 days.

### Tier 2 — Differentiation (Week 3–4)

| ID | Build | Done when |
|----|-------|-----------|
| T2-1 | Follow-up one-tap send | Draft ready, user confirms |
| T2-2 | Interview mode per job | Resume + 5 likely questions |
| T2-3 | Contact enrichment on high matches | Recruiter email visible |
| T2-4 | Squad invite (2–3 users) | Shared queue visibility |
| T2-5 | Landing case study | Real numbers published |

### Tier 3 — Growth (Month 2+)

| ID | Build | Done when |
|----|-------|-----------|
| T3-1 | Waitlist → self-serve signup | Public onboarding |
| T3-2 | Pricing tier | Free queue / paid auto-apply |
| T3-3 | App Store PWA wrapper | Mobile distribution |
| T3-4 | Production apply architecture | Apply works without local Mac |

### De-scope until Tier 1 proven

Monitor sub-tabs beyond overview, Swarm, Conferences, Social admin, Ask AI concierge (unless interview-focused), LinkedIn admin workflow, deep analytics.

---

## 6. 30-Day Build Order

| Week | Focus | Ship (checklist) |
|------|--------|------------------|
| **1** | Trust | T0-1…T0-6. Push to main. Hard-refresh prod. |
| **2** | Loop | T1-1, T1-2, T1-3. You approve 10 real jobs. |
| **3** | Proof | T1-4, T1-5, T1-6. Log first recruiter reply. |
| **4** | Growth | T2-1, T2-5. Invite 2 beta users. 1 case study. |

### Week 1 day-by-day

| Day | Task |
|-----|------|
| 1 | Deploy auth fixes. Verify forgot password prod + mobile. |
| 2 | Run `local:check`. Fix any red items. Document smoke test. |
| 3 | Onboarding: add "Add to queue" CTA after matches. |
| 4 | Empty states: queue, matches, follow-ups. |
| 5 | PWA update banner test. |
| 6–7 | Full personal run: resume → 5 approvals → 1 apply → 1 follow-up. |

---

## 7. Competitive Matrix (one page)

| Capability | remotelymatch | LinkedIn/Indeed | Teal/Huntr | Simplify/LazyApply |
|------------|---------------|-----------------|------------|---------------------|
| Job inventory | Medium (agent) | **Huge** | Low | Medium |
| Resume-based match | **Strong** | Weak | Medium | Medium |
| Approve before apply | **Core** | — | — | Rare |
| Auto-apply execution | **Yes** (local) | — | — | **Yes** |
| Tailored resume/job | **Yes** | — | Medium | Medium |
| Follow-up drafts | **Yes** | — | Low | Low |
| Interview prep | Yes | Low | Medium | Low |
| Team/squad | **Unique** | — | Low | — |
| Chrome extension | Yes | — | Some | Yes |
| Mobile | PWA | Native | Web | Varies |
| Polish/trust | **Gap** | **Strong** | Strong | Medium |
| Distribution | **Gap** | **Strong** | Medium | Medium |

---

## 8. API Quick Reference

| Domain | Prefix | Key endpoints |
|--------|--------|---------------|
| Health | `/api/health` | GET |
| Auth | `/api/auth` | login, forgot-password, reset-password-code, passkey |
| Profile | `/api/profile` | GET/PUT, POST resume/parse |
| Jobs | `/api/jobs` | GET list, POST ingest, GET boards/catalog |
| Approvals | `/api/approvals` | list, approve, reject, bulk, linkedin-ingest |
| Applications | `/api/applications` | list, kit generate/polish |
| Agent | `/api/agent` | POST run, POST apply-approved, GET runs |
| Traction | `/api/traction` | follow-up board, enrich, send |
| Observability | `/api/admin/observability` | GET dashboard (admin) |
| Users | `/api/users` | CRUD, reset-password (admin) |

---

## 9. Known Issues & Constraints

1. **Nested duplicate folder** at `remotelymatch/remotelymatch/` — ignore; use parent repo only.
2. **Production Python apply** — not in Docker; run apply from local Mac.
3. **Agent data lag** — prod jobs stale until `npm run deploy:data`.
4. **Render free tier** — cold starts ~30–60s after idle.
5. **Invite-only** — no public signup yet.
6. **Forgot password** — requires MongoDB; fixes in commits `ec6730d`, `8366ffa`.
7. **Cursor terminal** — paste bug; use macOS Terminal.app for long commands.

---

## 10. How to Use This Doc in ChatGPT

### Suggested ChatGPT Project instructions

```
You are the product + engineering copilot for remotelymatch, a remote job 
operations app. Your mission is to help the founder get job interviews by 
improving and using the app.

Always reference docs/PROJECT_MASTER.md for architecture and priorities.
Default to Tier 0–1 tasks unless trust/loop is proven.
Prefer small shippable PRs over new features.
When suggesting code, target repo path: /Users/user/job-event-agent/remotelymatch
Never confuse with /Users/user/remote-job-agent (Python job-fetcher only).

Weekly coaching: run the Personal Playbook (Section 4).
Build coaching: follow 30-Day Build Order (Section 6).
```

### Good prompts to use

- "What should I build today from Tier 0?"
- "Walk me through my weekly interview loop using the app."
- "Debug why [X] isn't working — here's the error: …"
- "Draft a case study from my application stats."
- "Review my queue — what should I approve this week?"
- "Write the PR for T1-2 one-tap approve."

---

## 11. Git & Deploy Checklist

```bash
# Before any prod change
cd /Users/user/job-event-agent/remotelymatch
git pull origin main
npm run local:check

# After code change
git add <files>
git commit -m "clear message: what and why"
git push origin main
# Wait ~5 min, hard-refresh remotelymatch.app

# After agent finds new jobs locally
npm run deploy:data
```

---

## 12. Founder Context

- **Primary user:** Leon (`leonix23@gmail.com`) — DevOps/SRE/Platform remote roles
- **Stage:** Private beta, invite-only, production live
- **Goal:** Personal interviews first, then 2–3 beta users, then productize
- **Brand:** remotelymatch.app — teal + gold, mobile-first PWA

---

*Last updated: July 2026. Regenerate or append when major architecture or PMF shifts occur.*
