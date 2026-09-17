# Coach rules, v1

The fitness coach changes loads, reps and calorie targets **only** through these
rules. The code that runs them is `src/lib/fitness/rules.ts` (numbers) and
`progression.ts`, `nutrition.ts`, `readiness.ts`, `card.ts` (logic). Every change
the coach announces cites a rule ID from this page.

**Changing a rule means a new version.** Add `RULES_V2` next to `RULES_V1`, keep v1
callable (the monthly replay recomputes old prescriptions under the version they
were made with), switch `CURRENT_RULES`, and copy this file to the new version.

Sources: `D:\Dev\Gym\docs\03-training.md` (Training01), `02-nutrition.md`,
`04-tracking.md`, `06-dashboard.md`, `05-evidence.md`.

## Progression (per lift, from the log)

The state of each lift (working load, rep targets, consecutive successes and
misses, last deload, last load change) is rebuilt from the whole log on every run.
A lift failed three weeks ago is a row, not a memory.

| ID | Rule |
|---|---|
| P1 | Double progression: every prescribed set reaches the top of the rep range → next session adds **one step** and resets reps to the bottom of the range. |
| P2 | Inside the range → same load, aim for one more rep per set (capped at the top). Reps-only lifts at the top of the range stay there. |
| P3 | A set below the range is a **miss**. The third miss in a row → deload **10%** (rounded down to a loadable weight, at least one step, at most 20% + one step). |
| P4 | The card is a target; the log is truth. If the logged load differs from the card, the next target follows the load actually lifted. |
| P5 | One load change per lift per calendar week (Mon–Sun). A success that would be a second change waits for next week; so does a deload. |
| P6 | **Hard bound:** an increase is never more than one step. A violation stops the run (assertion). |

**Steps** come from the gym settings (Settings → Gym equipment) and are always a
multiple of what the plates can load:

| Equipment | Step |
|---|---|
| Barbell, EZ/straight bar, Smith, plate-loaded machine | 2.5 kg upper body, 5 kg lower body (2 × smallest plate if larger) |
| 45° sled | 10 kg (calf raise 5 kg) |
| Dumbbells | the dumbbell step (default 2.5 kg) |
| Cable and selectorised stacks | the stack step (default 5 kg) |
| Dip belt (pull-ups) | 2.5 kg |
| Plate (neck) | 1.25 kg |
| Bodyweight reps only | no load step |

Increases round **down** onto the grid, so a load left off-grid by a gym change still
moves by at most one step.

## Baselines (week 3)

| ID | Rule |
|---|---|
| B1 | The first session of bench, overhead press, pull-up, squat and RDL is the 8-rep test (normally week 3, from Mon 21 Sep). Estimated max = Epley(load, reps + 2 assumed in reserve), heaviest wins. Working loads = the load for the bottom of each slot's range at its RIR, rounded down. Pull-ups use total load (bodyweight + belt). The test session itself is not judged. |
| B2 | Other exercises start from their first logged working session (the heaviest load that reached the range) and are judged from that session on. |
| B3 | The conventional deadlift enters in week 5 (Mon 5 Oct) at **60% of the week-3 8-rep RDL**, then progresses from its own log. |
| S1 | Wednesday speed bench = **60%** of the current estimated bench max (best bench set of ≤ 12 reps in the last 28 days, or the baseline), rounded down. 5 × 3, never a grind. |

## Readiness gate: sets intent, never load

| ID | Rule |
|---|---|
| R1 | A best-set attempt (last set of the first working lift: every clean rep at the planned load) is allowed when last night's sleep is **≥ 7 h** and yesterday's calories were **≥ 90%** of target. Placeholders until about six weeks of his own data exist. Missing either input keeps the gate closed and says what is missing. |
| R2 | No best-set attempt on a lift within **14 days** of its deload. |
| R3 | No best-set attempts during the ramp-in (weeks 1–2) or the baseline week. |

## Nutrition (weekly review on Mondays, monthly audit on the first Monday)

Protein (120 g) and fat (70 g) are frozen; **carbs are the only dial**. Weigh-ins
count only when taken under the fixed conditions; averages need **≥ 4 readings a
week**. Entries before Mon 21 Sep are ramp-in: kept, never used by the rules.

| ID | Rule |
|---|---|
| N1 | Weight average **flat for 2+ weeks** (the latest complete week's average is less than **0.15 kg** above the one two weeks earlier) → **+25 g carbs (+100 kcal)**. First possible Monday: 12 Oct. |
| N2 | Monthly: waist up **more than 1 cm** in about four weeks while weight climbed → **−150 kcal** (−37.5 g carbs). |
| N3 | Waist should grow **≤ 1 cm per 2 kg** gained. Above 0.5 cm/kg → warning; at 1 cm/kg or more (with ≥ 1 kg gained) → the N2 cut. |
| N4 | Weight **+1.0–1.25 kg** in the month, waist **≤ +0.5 cm**, lifts up → change nothing. |
| N5 | Weight up but no main lift improved for **3+ weeks** → not a food problem: audit sleep, then training. No calorie change. |
| N6 | Nothing moves on a single day. The weekly review needs this week's **waist** (the rules don't run without it); at least **14 days** between calorie changes; at most one change per run, and the waist guardrail outranks the flat-weight rule. |
| N7 | At a **65 kg** 7-day average, the target rate drops from 0.4–0.5% to **0.25–0.3%** of bodyweight a week, and calories need recalculating with the plan (flagged, not automatic). |

A calorie change made by an earlier revision of the same day's run is re-decided by
each later revision, so a re-run never stacks a second change.

## Data and audit

| ID | Rule |
|---|---|
| M1 | Missing data is shown as missing, never inferred. A day with no session logged repeats that session's card unchanged. |
| O1 | He can override any load (from today) or the calorie targets. Overrides are logged like any change and can be undone. |
| A1 | **Hard bound:** no single-rep sets before **1 December 2026**. |
| A2 | The ramp-in schedule governs until week 5: weeks 1–2 are the trainer block (3–4 days, ~50–60%, 2 sets, 4–5 reps short); weeks 3–4 run five days (Friday off by default, set in Settings); from 5 Oct all six days run and the RDL drops from 4 sets to 3. |

**Monthly replay:** on the first Monday of each month the coach recomputes every
stored prescription from the log as it stood at that run, under that run's rules
version, and compares card, gate, targets and lift state. Any divergence is drift and
is listed on Coach → Replay audit. The log is append-only (edits keep the old row),
which is what makes the replay exact.

## Bests

Rep and load bests count only sets of **6–12 reps** after the ramp-in. Bench (73 kg)
and weighted pull-up (86 kg total) report **regain** until the December 2025 peak is
passed; only then do PRs start.
