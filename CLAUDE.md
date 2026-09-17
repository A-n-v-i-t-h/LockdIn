# CLAUDE.md

@AGENTS.md

LockdIn: the personal dashboard for one athlete (Anvith). Built 2026-09-17.
**Read `D:\Dev\Gym\CLAUDE.md` first.** Its working agreement applies here: he drives,
you validate and redirect with the arithmetic, and training selection is closed
(Training01). The plan, rules and evidence live in `D:\Dev\Gym\docs\`; the dashboard
spec is `D:\Dev\Gym\docs\06-dashboard.md`.

## Commands

```bash
npm run dev          # dev server (local PGlite in .data/pglite)
npm run build && npm start
npm test             # Vitest: tests/unit and tests/integration (in-memory Postgres)
npm run test:e2e     # Playwright against 3 seeded servers; needs a fresh `npm run build`
npm run check        # typecheck, lint, unit, build, e2e
npm run db:migrate   # applies src/lib/db/migrations.ts to DATABASE_URL (or local PGlite); --print for SQL
npm run user:create -- --email … --name …   # the only way to create an account
npm run agent:run -- [--email …] [--replay] [--force]
npm run demo         # seeded demo on :3100 (after a build)
```

Next.js 16: read `node_modules/next/dist/docs/` before framework work (async request APIs,
`proxy.ts` instead of middleware, server actions).

## Architecture

- **One data path.** Browser → server actions / server components → `getDb()` → Postgres.
  The browser never talks to the database. `DATABASE_URL` (postgres://…) selects postgres.js
  (Supabase pooler, `prepare: false`); otherwise PGlite at `PGLITE_DIR`. Both drivers return
  dates as `YYYY-MM-DD`, timestamps as ISO strings, numerics as numbers. Always cast
  parameters in SQL (`$1::date`). PGlite is one connection: inside `db.tx(q => …)` use `q`,
  never `db`, or it deadlocks.
- **Schema** lives in `src/lib/db/migrations.ts` (append new versions; never edit an applied
  one once production exists). `LOCK_DOWN_SQL` runs after every migrate: RLS on every table,
  no policies, grants revoked from Supabase's `anon`/`authenticated`, so the public Data API
  sees nothing. The app connects as the table owner.
- **History, not state (the Markus lesson).** Fitness tables are append-only: an edit stamps
  `superseded_at` on the old row and inserts the new one with `recorded_at` at the same
  instant. Read "as of T" with `recorded_at <= T and (superseded_at is null or superseded_at > T)`.
  Plain modules use ordinary rows with soft deletes; habits keep dated `habit_logs`.
- **Auth** (`src/lib/auth`): scrypt hashes, HS256 session cookie with `sv` (session version),
  `getCurrentUser()` checks the version against the database; `proxy.ts` only does the
  optimistic signature check. Every server action starts with `getCurrentUser()`/`requireUser()`
  and every query filters by `user_id`. Login lockout: 5 failures per email / 20 per IP in 15 min.
- **Time:** India only (fixed +05:30, `src/lib/time.ts`). "Today" is IST. Totals entered before
  04:00 belong to the previous day. `LOCKDIN_FAKE_NOW` sets a ticking fake clock for tests and
  demos (ignored when `VERCEL_ENV=production`).

## The coach (`src/lib/fitness`)

- `program.ts` is Training01 as data: sessions by weekday, slots (sets, rep range, RIR, rest),
  tracks (one progression per track; the same track on two days is one progression), one
  substitute per exercise (substitutes get their own track `sub:<main>:<exercise>`), peaks.
  Change it only if the plan changes; bump `PROGRAM_VERSION`.
- `schedule.ts`: weeks 1–2 ramp-in (trainer block, optional days, 2 sets), week 3 baseline,
  weeks 3–4 five days (rest day from settings, default Friday), week 5+ six days; deadlift
  from 5 Oct; RDL 4 sets until then.
- `progression.ts` rebuilds every lift's state from the log on every run (events sorted by
  date; overrides dated D apply to D's card, sessions dated D apply from D+1). `card.ts` turns
  state into the workout card. `readiness.ts`, `nutrition.ts`, `bests.ts`, `coach.ts` do the
  rest. `engine.ts` `computeMorning()` is the whole morning run as a **pure function**;
  `inputsDigest()` fingerprints its inputs (content included).
- `agent.ts` `runCoach()` loads the log as of now, stores a new **revision** of the day's run
  only when the digest changed, writes the day's calorie target (re-decided by each revision,
  never stacked), the lift-state cache and reviews. `replayHistory()` recomputes every stored
  run as of its time under its rules version and diffs it; it runs on the first Monday.
  `refreshCoach()` (after writes) logs failures instead of throwing.
- **Past days:** logs are accepted for today and the 30 days before. A past day with no
  stored run (before the app was in use, or a day with no cron and no visit) shows its plan
  from `plannedCard()` (`src/lib/views/fitness.ts`), computed on the fly and never stored.
  A session's `run_id` is linked only when the run belongs to the same account.
- **Rules are versioned** (`rules.ts` + `rules/RULES.md`). Never edit v1's numbers: add v2,
  keep v1 in `RULE_SETS`, switch `CURRENT_RULES`, update RULES.md. Hard bounds throw
  `RuleAssertionError` (P6 one step, A1 no singles before December).
- No AI model writes anything today (no Anthropic key was given). The note is composed from
  the rule outputs. A model could later rewrite the note's wording or read meal photos; it
  must never set a number.

## UI

Stencil (`docs/design/stencil-reference.html`): #131313 base, square corners, 2px borders,
plate red #E2463F for marks and lines, **#C63D36 for fills under white text** (contrast),
hazard yellow #E8B923, work-order paper #E7E3D8, fonts Saira Stencil / Saira Condensed /
Saira. Tokens and component classes are in `src/app/globals.css`. Home order changes with
the time of day (`dayPart`). Forms use `useFormSubmit` (no React auto-reset, so validation
errors keep input). Keep pages passing axe WCAG 2.1 AA and 320 px widths (the e2e suite checks).

## Tests

- `tests/unit`: rules, schedule, equipment, progression, nutrition, bests, card, engine,
  modules, auth. `tests/integration`: the database layer, runs, revisions, replay, lockout,
  and `season.test.ts`, a simulated 7 Sep–3 Nov season through the real coach
  (`src/lib/demo/simulate.ts`) that must replay with zero drift.
- `tests/e2e`: `morning.*`, `evening.*`, `fresh.*` specs, each against its own server
  (`scripts/e2e-server.ts`). Use `formError(page)` (Next adds an empty `role=alert`) and
  `openDetails()` for `<details>`. After clicking a link to a page whose form has the same
  labels as the current one (add vs. edit), wait for the URL before typing.
- Text is not part of the replay comparison (numbers and statuses are), so wording can change
  without a rules version. Changing a number or a decision needs a new rules version.
- Writes in tests must use realistic timestamps: rows recorded before an existing run's
  as-of time are (correctly) reported as drift by the replay.

## State (2026-09-17)

- Built and tested locally. **Not deployed** and **not yet connected** to Supabase or Vercel:
  he will give the Supabase and Vercel tokens after reviewing this build. Deployment steps:
  `docs/DEPLOY.md`. GitHub: private repo `A-n-v-i-t-h/LockdIn`.
- His local account exists (`owner.credentials.local.txt`, gitignored), seeded from `LOG.md`:
  the 7 Sep weigh-in (57.7 kg), the two single-value month-0 tape readings, Phase 1 targets,
  and the plan's two goals. The ranged month-0 values stay in `LOG.md` until the assisted re-measure.
- Assumptions he may want to change (all visible in the app): gym increments are unconfirmed
  defaults (bar 20 kg, plates down to 1.25 kg, dumbbell step 2.5, cable step 5); the weeks 3–4
  rest day is Friday; readiness thresholds 7 h / 90% are placeholders; "flat" is < 0.15 kg over
  two weeks; substitutes outside Pull A are Claude's picks from his equipment list.
