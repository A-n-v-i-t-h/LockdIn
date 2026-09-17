// The fitness coach. Once a day (after the morning check-in, or from the cron
// fallback) it loads the log as of now, runs the rules, and stores the result
// as a revision of that day's run. No model judgement is involved in any number.
import type { Db, Queryable } from "@/lib/db";
import { localDate, now as clockNow } from "@/lib/time";
import { computeMorning, inputsDigest, stableStringify, type EngineInput, type MorningOutput } from "./engine";
import {
  getCurrentRun,
  insertRun,
  insertTargets,
  listRuns,
  loadMeasurements,
  loadNutrition,
  loadOverrides,
  loadSets,
  loadSettings,
  loadTargets,
  loadWeighIns,
  previousRunAsOf,
  replaceLiftState,
  saveReview,
  supersedeCoachTargets,
  type CoachRun,
} from "./repo";
import { CURRENT_RULES, rulesFor, type RuleSet } from "./rules";

export type Trigger = "checkin" | "cron" | "manual" | "view" | "override" | "settings" | "edit";

export async function loadEngineInput(
  q: Queryable,
  userId: string,
  date: string,
  asOf: string,
  rules: RuleSet = CURRENT_RULES,
  prevAsOf?: string | null,
): Promise<EngineInput> {
  const [weighIns, nutrition, measurements, sets, overrides, targets, settings, previous] = await Promise.all([
    loadWeighIns(q, userId, asOf),
    loadNutrition(q, userId, asOf),
    loadMeasurements(q, userId, asOf),
    loadSets(q, userId, asOf),
    loadOverrides(q, userId, asOf),
    loadTargets(q, userId, asOf),
    loadSettings(q, userId, asOf),
    prevAsOf === undefined ? previousRunAsOf(q, userId, date) : Promise.resolve(prevAsOf),
  ]);
  return {
    date,
    asOf,
    rules,
    gym: settings.gym,
    schedule: settings.schedule,
    weighIns,
    nutrition,
    measurements,
    sets,
    overrides,
    // A day's own coach target is re-decided by every revision of that day's run.
    targets: targets.filter((t) => !(t.source === "coach" && t.effectiveDate === date)),
    previousRunAsOf: previous,
  };
}

export interface RunResult {
  run: CoachRun;
  created: boolean;
}

/**
 * Runs the coach for a user's local "today". A new revision is stored only when
 * the inputs changed; otherwise the current run is returned untouched.
 */
export async function runCoach(
  db: Db,
  userId: string,
  opts: { trigger: Trigger; at?: Date; date?: string; force?: boolean },
): Promise<RunResult> {
  const requested = opts.at ?? clockNow();
  const date = opts.date ?? localDate(requested);
  const current = await getCurrentRun(db, userId, date);
  if (opts.trigger === "view" && current) return { run: current, created: false };
  // Guard against clock skew between servers: as-of times only move forward.
  const at = current && Date.parse(current.asOf) > requested.getTime() ? new Date(current.asOf) : requested;
  const asOf = at.toISOString();

  const input = await loadEngineInput(db, userId, date, asOf);
  const digest = inputsDigest(input);
  if (current && current.inputsDigest === digest && current.rulesVersion === input.rules.version && !opts.force) {
    return { run: current, created: false };
  }
  const output = computeMorning(input);

  const run = await db.tx(async (q) => {
    const stored = await insertRun(q, userId, {
      date,
      trigger: opts.trigger,
      asOf,
      rulesVersion: input.rules.version,
      digest,
      output,
    });
    await supersedeCoachTargets(q, userId, date, asOf);
    const change = output.targets.change;
    if (change) {
      await insertTargets(
        q,
        userId,
        {
          effectiveDate: date,
          kcal: change.to.kcal,
          protein: change.to.protein,
          carbs: change.to.carbs,
          fat: change.to.fat,
          source: "coach",
          reason: `${change.rule}: ${change.reason}`,
          runId: stored.id,
        },
        asOf,
      );
    }
    await replaceLiftState(q, userId, output.states, stored.id, asOf);
    if (output.weekly) await saveReview(q, userId, { kind: "weekly", date, runId: stored.id, result: output.weekly }, asOf);
    if (output.monthly) await saveReview(q, userId, { kind: "monthly", date, runId: stored.id, result: output.monthly }, asOf);
    return stored;
  });

  if (output.replayDue) {
    const replay = await replayHistory(db, userId, { before: date });
    await saveReview(db, userId, { kind: "replay", date, runId: run.id, result: replay }, asOf);
  }
  return { run, created: true };
}

/** Today's run, creating it if the coach hasn't run yet today. */
export async function ensureTodayRun(db: Db, userId: string, at: Date = clockNow()): Promise<CoachRun> {
  const { run } = await runCoach(db, userId, { trigger: "view", at });
  return run;
}

/**
 * After any write that can change today's prescription. Cheap when nothing changed.
 * The user's write has already been saved, so a coach failure is logged rather than
 * thrown; the next run (a page view, the cron) tries again and surfaces it.
 */
export async function refreshCoach(db: Db, userId: string, trigger: Trigger, at: Date = clockNow()): Promise<RunResult | null> {
  try {
    return await runCoach(db, userId, { trigger, at });
  } catch (e) {
    console.error("coach refresh failed", { userId, trigger }, e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Monthly replay test
// ---------------------------------------------------------------------------

export interface Divergence {
  runId: string;
  date: string;
  field: string;
  stored: unknown;
  recomputed: unknown;
}

export interface ReplayResult {
  ranAt: string;
  checked: number;
  divergent: number;
  divergences: Divergence[];
}

function pickCard(o: MorningOutput) {
  return o.card.slots.map((s) => ({ slot: s.slot, track: s.track, status: s.status, sets: s.sets, weight: s.weight, reps: s.repTargets }));
}

function pickStates(o: MorningOutput) {
  return Object.fromEntries(
    Object.entries(o.states)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, s]) => [k, { status: s.status, weight: s.weight, reps: s.repTargets, misses: s.misses, successes: s.successes, lastDeload: s.lastDeload }]),
  );
}

export function compareOutputs(stored: MorningOutput, fresh: MorningOutput): { field: string; stored: unknown; recomputed: unknown }[] {
  const checks: [string, unknown, unknown][] = [
    ["card", pickCard(stored), pickCard(fresh)],
    ["gate", stored.gate.status, fresh.gate.status],
    ["targets.current", stored.targets.current, fresh.targets.current],
    ["targets.change", stored.targets.change && { kcal: stored.targets.change.kcalDelta, carbs: stored.targets.change.carbsDelta }, fresh.targets.change && { kcal: fresh.targets.change.kcalDelta, carbs: fresh.targets.change.carbsDelta }],
    ["states", pickStates(stored), pickStates(fresh)],
  ];
  return checks
    .filter(([, a, b]) => stableStringify(a) !== stableStringify(b))
    .map(([field, a, b]) => ({ field, stored: a, recomputed: b }));
}

/** Recompute every stored prescription from the log as it stood, and diff. Any divergence is drift. */
export async function replayHistory(db: Db, userId: string, opts: { before?: string } = {}): Promise<ReplayResult> {
  const runs = (await listRuns(db, userId)).filter((r) => !opts.before || r.runDate < opts.before);
  const divergences: Divergence[] = [];
  const divergentRuns = new Set<string>();
  for (const run of runs.sort((a, b) => (a.runDate < b.runDate ? -1 : 1))) {
    const rules = rulesFor(run.rulesVersion);
    if (!rules) {
      divergences.push({ runId: run.id, date: run.runDate, field: "rules", stored: run.rulesVersion, recomputed: "unknown version" });
      divergentRuns.add(run.id);
      continue;
    }
    const input = await loadEngineInput(db, userId, run.runDate, run.asOf, rules, run.output.meta?.previousRunAsOf ?? null);
    const digest = inputsDigest(input);
    if (digest !== run.inputsDigest) {
      divergences.push({ runId: run.id, date: run.runDate, field: "inputs", stored: run.inputsDigest, recomputed: digest });
      divergentRuns.add(run.id);
    }
    const fresh = computeMorning(input);
    for (const d of compareOutputs(run.output, fresh)) {
      divergences.push({ runId: run.id, date: run.runDate, ...d });
      divergentRuns.add(run.id);
    }
  }
  return { ranAt: clockNow().toISOString(), checked: runs.length, divergent: divergentRuns.size, divergences };
}
