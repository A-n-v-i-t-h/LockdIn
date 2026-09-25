# LockdIn

A personal dashboard for one athlete: **fitness, goals, tasks, habits, calendar and
journal**, mobile-first, in the Stencil look. Only fitness has a coach, and every
number the coach sets comes from fixed, versioned rules ([rules/RULES.md](rules/RULES.md)),
never from model judgement.

The plan it coaches is **Training01** from `D:\Dev\Gym\docs` (the program of record,
closed 17 Sep 2026). The dashboard requirements are `D:\Dev\Gym\docs\06-dashboard.md`.

## What it does

- **Morning:** weigh-in (fixed conditions), sleep and wake, and the Monday waist, on one screen with a keypad. Saving re-runs the coach.
- **Workout card:** exercise, sets, reps and load prefilled, the plates to load (new ones marked), one substitute per exercise, a rest timer. A planned set is one tap; only deviations need typing.
- **Evening:** the four Cronometer totals, with plain feedback against the targets. An optional meal line is checked against the plan's food library.
- **Coach, every morning** (after the check-in, with a 10:00–11:00 cron fallback): progression per lift, baselines in week 3, the readiness gate, the Monday calorie review, the monthly audit and the monthly replay test, and a coach's note saying what changed, why and what's next. Every change is logged with its rule and can be overridden.
- **History:** every session, weigh-in and food total, with edits kept. Any of the last 30 days can be filled in (History → Log a past day), including days before the app was in use.
- **Progress:** the 7-day average against the target band (ramp-in shaded), waist against the 1 cm per 2 kg limit, regain toward the December 2025 peaks, the road to a 100 kg bench, calories, bests.
- **Plan:** tasks (Today / Upcoming / Someday / Done), habits with dated history and real streaks, goals (milestones, or auto goals read from the log).
- **Calendar:** task deadlines, goal deadlines and commitments. Gym sessions never appear.
- **Journal:** entries with tags, search and filters.
- **Settings:** gym equipment (bar, plates, dumbbell and cable steps, with "checked at the gym" flags), the weeks 3–4 rest day, password, sign out everywhere, a full data export.
- Installable as an app (manifest, icons, service worker that never caches personal data).

## Run it on this PC

Requires Node 20.11+ (22 used here).

```bash
npm install
npm run build
npm start            # http://localhost:3000, your real account, local database in .data/pglite
```

Your login is in `owner.credentials.local.txt` (gitignored). Change the password in
Settings → Account.

**Demo with seven weeks of simulated logs** (Thursday 29 October, 18:45):

```bash
npm run build
npm run demo         # http://localhost:3100, demo@lockdin.test / stencil-plate-rack-42
```

## Tests

```bash
npm test             # 180 unit and database tests (Vitest + in-memory Postgres)
npm run test:e2e     # 33 browser tests (Playwright, uses the installed Chrome), needs `npm run build`
npm run check        # types, lint, unit, build, browser
```

The browser tests start three seeded servers (morning and evening on 29 Oct with a
simulated season, and the real starting point on 17 Sep), and cover logging,
the coach, overrides, the replay test, every module, accessibility (axe, WCAG 2.1 AA),
phone widths down to 320 px, login lockout, sessions, the cron secret and security headers.

## How it's built

- **Next.js 16** (App Router, server actions), **React 19**, TypeScript, plain CSS (Stencil tokens in `src/app/globals.css`).
- **Postgres** everywhere: PGlite (Postgres in WebAssembly) on this PC and in tests; **Supabase** Postgres in production through the transaction pooler. Same SQL, same code.
- **Auth:** one account, email + password (scrypt), a signed session cookie with a session version (password change and "sign out everywhere" end every other session), lockout after repeated failures. No public sign-up.
- **History, not state:** the fitness log is append-only. Edits keep the previous row, so any past moment can be read exactly, and the coach's prescriptions can be replayed.
- **Hosting:** Vercel, with a daily cron calling `/api/cron/morning`.

See [CLAUDE.md](CLAUDE.md) for the architecture and [docs/DEPLOY.md](docs/DEPLOY.md) for going online.

## Layout

```
src/app/            pages, server actions, API routes (cron, photos, export)
src/lib/fitness/    Training01, schedule, equipment, progression, readiness, nutrition, bests, card, coach, engine, agent, repo
src/lib/modules/    tasks, habits, goals, calendar, journal
src/lib/db/         drivers (PGlite / postgres.js), migrations, migrate
src/lib/auth/       passwords, session tokens, accounts
src/lib/demo/       season simulator and sample content (tests and demo only)
rules/RULES.md      the coach's rules, v1
scripts/            migrate, create-user, run-agent, e2e/demo server, icons, screenshots
tests/              unit, integration (database), e2e (browser)
docs/design/        the Stencil spec and its reference page
```
