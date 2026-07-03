# remotelymatch Roadmap

**Mission:** Get interviews through the app.  
**Full brief:** [docs/PROJECT_MASTER.md](docs/PROJECT_MASTER.md)  
**North star:** Resume → matches → approve → apply → follow-up → **interview in 14 days**.

> **Rule:** If it doesn't help get an interview in 7 days, it waits.

---

## 6-month strategy (primary focus)

Everything in the next six months serves **one loop** — find the right job, apply well, reach the right person, follow up, prep for the interview, learn what worked.

| # | Pillar | What "better" means | Code today | Roadmap / issues |
|---|--------|---------------------|------------|------------------|
| **1** | **Job matching** | Explainable scores, fewer false positives, re-rank from outcomes | `jobScoringService.js`, `TopMatchJobsPreview.vue` | T1-1 [#8](https://github.com/leonix33/remotelymatch/issues/8) |
| **2** | **Resume tailoring** | Per-job kits that pass ATS and sound human | `resumeTailorService.js`, `applicationKitService.js`, `atsKeywordService.js` | T1-3 [#10](https://github.com/leonix33/remotelymatch/issues/10) |
| **3** | **Recruiter targeting** | Right contact, right channel, ranked by reply likelihood | `contactEnrichmentService.js`, `contactRankingService.js`, Hunter/Apollo | T2-3 [#16](https://github.com/leonix33/remotelymatch/issues/16) |
| **4** | **Follow-up automation** | Timed drafts, one-tap send, weekly nudges | `followUpDraftService.js`, `followUpSendService.js`, `weeklyPulseService.js` | T2-1 [#14](https://github.com/leonix33/remotelymatch/issues/14), T1-5 [#12](https://github.com/leonix33/remotelymatch/issues/12) |
| **5** | **Interview preparation** | Per-job prep: resume + company + likely questions | `interviewService.js`, `InterviewView.vue` | T2-2 [#15](https://github.com/leonix33/remotelymatch/issues/15) |
| **6** | **Outcome learning** | Log reply/interview/offer; feed back into match + tailor | `outcomeService.js`, `conversionStatsService.js` | T1-4 [#11](https://github.com/leonix33/remotelymatch/issues/11) |

**Do not build** (until pillars 1–6 move metrics): Swarm, Conferences, Social admin, deep Monitor tabs, generic Ask AI concierge, pricing/signup (Tier 3).

### 6-month calendar

| Month | Focus | Ship |
|-------|--------|------|
| **1** | Trust (Tier 0) + matching + tailoring | T0-* done; T1-1, T1-2, T1-3 live; you approve 40 real jobs |
| **2** | Recruiter targeting + follow-ups | T2-3, T2-1, T1-5; first recruiter replies logged |
| **3** | Interview prep + outcome loop | T2-2, T1-4; match scores use outcome data |
| **4** | Polish pillars 1–4 from real data | Higher reply rate; kit quality from A/B on outcomes |
| **5** | Double down on what converts | Drop low-yield sources; enrich winners |
| **6** | Case study + 2 beta users | T2-5; only then Tier 3 (signup/pricing) |

**Success by month 6:** Stable weekly loop, documented reply/interview rates, product story backed by your numbers.

---

## Progress (30-day bootstrap → 6-month pillars)

| Phase | Focus | Status |
|-------|--------|--------|
| **Tier 0** | Trust & reliability | Week 1 — in progress |
| **Tier 1** | Core loop → pillars **1, 2, 6** | Week 2–3 |
| **Tier 2** | Differentiation → pillars **3, 4, 5** | Week 3–4 |
| **Tier 3** | Growth (month 6+) | Deferred |

---

## Tier 0 — Trust & reliability (Week 1)

- [ ] **T0-1** Forgot password works mobile + web → user resets password end-to-end
- [ ] **T0-2** PWA cache bust / "Update available" reload → no stale bundles after deploy
- [ ] **T0-3** First-5-min smoke test documented → fresh account: resume → match → queue
- [ ] **T0-4** Stable `npm run dev` → `npm run local:check` all green
- [ ] **T0-5** Onboarding CTA: "Add to queue" → one obvious next step after matches
- [ ] **T0-6** Empty states on queue, matches, follow-ups → never a blank screen

## Tier 1 — Core loop proof (Week 2–3)

- [ ] **T1-1** "Why this job" on every match card → user understands score
- [ ] **T1-2** One-tap approve from match list → &lt; 3 taps to queue
- [ ] **T1-3** Kit preview before approve → user sees tailored snippet
- [ ] **T1-4** Outcome tracker: Applied → Reply → Interview → Offer
- [ ] **T1-5** Weekly digest email → "5 matches, 2 to approve, 1 follow-up due"
- [ ] **T1-6** Chrome extension polish → LinkedIn → queue in 2 clicks

**Success metric:** 10 approved applications/week → ≥1 recruiter response in 14 days.

## Tier 2 — Differentiation (Week 3–4)

- [ ] **T2-1** Follow-up one-tap send → draft ready, user confirms
- [ ] **T2-2** Interview mode per job → resume + 5 likely questions
- [ ] **T2-3** Contact enrichment on high matches → recruiter email visible
- [ ] **T2-4** Squad invite (2–3 users) → shared queue visibility
- [ ] **T2-5** Landing case study → real numbers published

## Tier 3 — Growth (Month 2+)

- [ ] **T3-1** Waitlist → self-serve signup
- [ ] **T3-2** Pricing tier → free queue / paid auto-apply
- [ ] **T3-3** App Store PWA wrapper
- [ ] **T3-4** Production apply architecture → apply without local Mac

---

## 30-day build order

| Week | Ship |
|------|------|
| **1** | T0-1 … T0-6. Push to main. Hard-refresh prod. |
| **2** | T1-1, T1-2, T1-3. Approve 10 real jobs. |
| **3** | T1-4, T1-5, T1-6. Log first recruiter reply. |
| **4** | T2-1, T2-5. Invite 2 beta users. Publish case study. |

### Week 1 — day by day

| Day | Task |
|-----|------|
| 1 | Deploy auth fixes. Verify forgot password on prod + mobile. |
| 2 | Run `local:check`. Fix reds. Document smoke test. |
| 3 | Onboarding: "Add to queue" CTA after matches. |
| 4 | Empty states: queue, matches, follow-ups. |
| 5 | PWA update banner test. |
| 6–7 | Personal run: resume → 5 approvals → 1 apply → 1 follow-up. |

---

## De-scope (6-month rule)

Do **not** build until pillars 1–6 improve reply/interview rates:

- Monitor sub-tabs beyond overview
- Swarm, Conferences, Social admin
- Ask AI concierge (unless interview prep — pillar 5)
- LinkedIn admin workflow
- Deep analytics dashboards
- Tier 3 (signup, pricing, App Store) until month 6

---

## GitHub issues

Milestone: **[30-Day PMF](https://github.com/leonix33/remotelymatch/milestone/1)**

| ID | Issue |
|----|-------|
| T0-1 | [#2](https://github.com/leonix33/remotelymatch/issues/2) Forgot password |
| T0-2 | [#3](https://github.com/leonix33/remotelymatch/issues/3) PWA cache bust |
| T0-3 | [#4](https://github.com/leonix33/remotelymatch/issues/4) Smoke test |
| T0-4 | [#5](https://github.com/leonix33/remotelymatch/issues/5) Stable dev |
| T0-5 | [#6](https://github.com/leonix33/remotelymatch/issues/6) Onboarding CTA |
| T0-6 | [#7](https://github.com/leonix33/remotelymatch/issues/7) Empty states |
| T1-1 | [#8](https://github.com/leonix33/remotelymatch/issues/8) Why this job |
| T1-2 | [#9](https://github.com/leonix33/remotelymatch/issues/9) One-tap approve |
| T1-3 | [#10](https://github.com/leonix33/remotelymatch/issues/10) Kit preview |
| T1-4 | [#11](https://github.com/leonix33/remotelymatch/issues/11) Outcome tracker |
| T1-5 | [#12](https://github.com/leonix33/remotelymatch/issues/12) Weekly digest |
| T1-6 | [#13](https://github.com/leonix33/remotelymatch/issues/13) Chrome extension |
| T2-1 | [#14](https://github.com/leonix33/remotelymatch/issues/14) Follow-up send |
| T2-2 | [#15](https://github.com/leonix33/remotelymatch/issues/15) Interview mode |
| T2-3 | [#16](https://github.com/leonix33/remotelymatch/issues/16) Contact enrichment |
| T2-4 | [#17](https://github.com/leonix33/remotelymatch/issues/17) Squad invite |
| T2-5 | [#18](https://github.com/leonix33/remotelymatch/issues/18) Case study |
| T3-1 | [#19](https://github.com/leonix33/remotelymatch/issues/19) Self-serve signup |
| T3-2 | [#20](https://github.com/leonix33/remotelymatch/issues/20) Pricing |
| T3-3 | [#21](https://github.com/leonix33/remotelymatch/issues/21) App Store wrapper |
| T3-4 | [#22](https://github.com/leonix33/remotelymatch/issues/22) Production apply |

```bash
gh issue list --milestone "30-Day PMF"
gh issue list --label "tier-0" --state open
```

---

## Quick commands

```bash
cd /Users/user/job-event-agent/remotelymatch
npm run local:check    # verify dev
npm run dev            # start locally
git push origin main   # deploy to remotelymatch.app
npm run deploy:data    # sync agent jobs to production
```

---

*Update checkboxes as items ship. Link PRs in GitHub issues.*
