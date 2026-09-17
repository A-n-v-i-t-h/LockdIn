// The morning run as one pure function: log history in, prescription out.
// The same inputs always give the same output, which is what makes the monthly
// replay test meaningful.
import { addDays, fmtShort, isFirstMondayOfMonth, weekday } from "@/lib/time";
import { computeBests, type BestEvent, type LiftBests } from "./bests";
import { buildCard, type Card } from "./card";
import { calorieChangeTitle, composeNote, type AnnouncedChange, type CoachNote } from "./coach";
import { fmtKg, type GymSettings } from "./equipment";
import {
  applyChange,
  dailyFeedback,
  monthlyAudit,
  sevenDayAverage,
  targetOn,
  weeklyReview,
  type CalorieChange,
  type FeedbackLine,
  type LiftTrend,
  type Measurement,
  type MonthlyAudit,
  type NutritionDay,
  type Targets,
  type WeeklyReview,
  type WeighIn,
} from "./nutrition";
import { exercise, schemeForTrack } from "./program";
import {
  BASELINE_GROUPS,
  computeProgression,
  epley,
  isChange,
  makeBodyweightLookup,
  totalLoad,
  type Baseline,
  type LoggedSet,
  type OverrideEvent,
  type TrackState,
  type Transition,
} from "./progression";
import { readinessGate, sleepMinutes, type Gate } from "./readiness";
import type { RuleSet } from "./rules";
import { dayPlan, isRampIn, nextDateForTrack, phaseOf, PHASE_LABEL, weekNumber, type Phase, type ScheduleSettings } from "./schedule";

export interface EngineInput {
  date: string;
  asOf: string;
  rules: RuleSet;
  gym: GymSettings;
  schedule: ScheduleSettings;
  weighIns: WeighIn[];
  nutrition: NutritionDay[];
  measurements: Measurement[];
  sets: LoggedSet[];
  overrides: OverrideEvent[];
  targets: Targets[];
  previousRunAsOf: string | null;
}

export interface TargetsLite {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  effectiveDate: string;
  source: string;
}

export interface MorningOutput {
  version: 1;
  meta: { asOf: string; previousRunAsOf: string | null };
  date: string;
  week: number;
  phase: Phase;
  phaseLabel: string;
  rulesVersion: string;
  card: Card;
  gate: Gate;
  morning: {
    weight: number | null;
    protocolOk: boolean | null;
    sevenDay: { avg: number | null; n: number };
    previousSevenDay: { avg: number | null; n: number };
    weeklyChange: number | null;
    sleepMinutes: number | null;
    waistToday: number | null;
    waistDue: boolean;
  };
  targets: {
    current: TargetsLite;
    change: (CalorieChange & { from: TargetsLite; to: TargetsLite }) | null;
  };
  yesterday: { date: string; totals: NutritionDay | null; feedback: FeedbackLine[] };
  weekly: WeeklyReview | null;
  monthly: MonthlyAudit | null;
  replayDue: boolean;
  changes: AnnouncedChange[];
  bestEvents: BestEvent[];
  phase2: { reached: boolean; avg: number | null };
  missing: string[];
  note: CoachNote;
  states: Record<string, TrackState>;
  baselines: Record<string, Baseline>;
}

const lite = (t: Targets): TargetsLite => ({
  kcal: t.kcal,
  protein: t.protein,
  carbs: t.carbs,
  fat: t.fat,
  effectiveDate: t.effectiveDate,
  source: t.source,
});

/** Did the main lifts improve over the last three weeks? */
export function liftTrend(sets: LoggedSet[], date: string, bodyweight: ReturnType<typeof makeBodyweightLookup>, weeks: number): LiftTrend | null {
  const recentFrom = addDays(date, -7 * weeks);
  const olderFrom = addDays(date, -7 * weeks * 2);
  const improved: string[] = [];
  let compared = 0;
  for (const [group, tracks] of Object.entries(BASELINE_GROUPS)) {
    const best = (from: string, to: string) => {
      let b = 0;
      for (const s of sets) {
        if (!tracks.includes(s.track) || s.isWarmup || isRampIn(s.date) || s.date < from || s.date >= to) continue;
        if (s.reps < 1 || s.reps > 12) continue;
        const load = totalLoad(exercise(s.exercise), s.weight, s.date, bodyweight);
        if (load !== null) b = Math.max(b, epley(load, s.reps));
      }
      return b;
    };
    const recent = best(recentFrom, date);
    const older = best(olderFrom, recentFrom);
    if (recent === 0 || older === 0) continue;
    compared++;
    if (recent > older + 1e-9) improved.push(group);
  }
  if (compared === 0) return null;
  return {
    up: improved.length > 0,
    flat: improved.length === 0,
    detail: improved.length ? `Up in the last ${weeks} weeks: ${improved.join(", ")}.` : `No main lift improved in the last ${weeks} weeks.`,
  };
}

function trackLabel(track: string): string {
  const slot = schemeForTrack(track);
  if (!slot) return track;
  const base = slot.label ?? exercise(slot.exercise).name;
  if (track.startsWith("sub:")) {
    const [, main, exKey] = track.split(":");
    return `${exercise(exKey).name} (swap for ${trackLabel(main)})`;
  }
  if (track === "bench_heavy") return "Bench (heavy)";
  if (track === "bench_volume") return "Bench (volume)";
  return base;
}

function loadLabel(track: string, kg: number | null): string {
  if (kg === null) return "—";
  const slot = schemeForTrack(track);
  const ex = slot ? exercise(track.startsWith("sub:") ? track.split(":")[2] : slot.exercise) : null;
  if (ex?.equipment === "belt") return kg === 0 ? "BW" : `BW+${fmtKg(kg)}`;
  return `${fmtKg(kg)}`;
}

export function announceTransition(t: Transition, schedule: ScheduleSettings): AnnouncedChange {
  const name = trackLabel(t.track);
  const from = t.from?.weight ?? null;
  const to = t.to.weight;
  const title =
    t.kind === "seed"
      ? `${name} starts at ${loadLabel(t.track, to)} kg`
      : `${name} ${loadLabel(t.track, from)} → ${loadLabel(t.track, to)} kg`;
  return {
    id: t.id,
    kind: "load",
    title,
    reason: t.reason,
    rule: t.rule,
    effective: nextDateForTrack(t.track, t.date, schedule),
    track: t.track,
    from,
    to,
    cited: t.cited,
  };
}

export function computeMorning(input: EngineInput): MorningOutput {
  const { date, rules } = input;
  const phase = phaseOf(date);
  const yesterday = addDays(date, -1);
  const bodyweight = makeBodyweightLookup(input.weighIns);

  const progression = computeProgression({
    sets: input.sets,
    overrides: input.overrides,
    gym: input.gym,
    bodyweight,
    before: date,
    rules,
  });

  // ---- Morning inputs ----
  const todayWeigh = input.weighIns.find((w) => w.date === date) ?? null;
  const sleep = todayWeigh ? sleepMinutes(todayWeigh.bedAt, todayWeigh.wakeAt) : null;
  const sevenDay = sevenDayAverage(input.weighIns, date);
  const previousSevenDay = sevenDayAverage(input.weighIns, addDays(date, -7));
  const weeklyChange =
    sevenDay.avg !== null && previousSevenDay.avg !== null ? Math.round((sevenDay.avg - previousSevenDay.avg) * 100) / 100 : null;
  const waistToday = input.measurements.find((m) => m.kind === "waist" && m.date === date)?.valueCm ?? null;

  // A calorie change made by an earlier revision of today's run is re-decided now,
  // so every revision of a day reaches the same decision from the same data.
  const targets = input.targets.filter((t) => !(t.source === "coach" && t.effectiveDate === date));
  const current = targetOn(targets, date);
  const yesterdayTarget = targetOn(targets, yesterday);
  const yTotals = input.nutrition.find((n) => n.date === yesterday) ?? null;

  const gate = readinessGate({
    phase,
    sleepMinutes: sleep,
    yesterdayKcal: yTotals?.kcal ?? null,
    kcalTarget: yesterdayTarget.kcal,
    rules,
  });

  const card = buildCard({
    date,
    schedule: input.schedule,
    gym: input.gym,
    rules,
    states: progression.states,
    transitions: progression.transitions,
    baselines: progression.baselines,
    sets: input.sets,
    gate,
    bodyweight,
  });

  // ---- Nutrition reviews ----
  const phase2Reached = sevenDay.avg !== null && sevenDay.n >= rules.nutrition.minReadingsPerWeek && sevenDay.avg >= rules.nutrition.phase2AtKg;
  const isMonday = weekday(date) === 1;
  const weekly = isMonday
    ? weeklyReview({ date, weighIns: input.weighIns, measurements: input.measurements, targets, phase2: phase2Reached, rules })
    : null;
  const firstMonday = isFirstMondayOfMonth(date);
  const monthly = firstMonday
    ? monthlyAudit({
        date,
        weighIns: input.weighIns,
        measurements: input.measurements,
        targets,
        lifts: liftTrend(input.sets, date, bodyweight, rules.nutrition.liftsFlatWeeks),
        rules,
      })
    : null;

  // One calorie change per run at most; the waist guardrail outranks the flat-weight rule.
  const calorieChange: CalorieChange | null = monthly?.change ?? weekly?.change ?? null;
  let targetChange: MorningOutput["targets"]["change"] = null;
  if (calorieChange) {
    const next = applyChange(current, calorieChange);
    targetChange = {
      ...calorieChange,
      from: lite(current),
      to: { ...next, effectiveDate: date, source: "coach" },
    };
  }

  // ---- What's new since the last run ----
  const cutoff = input.previousRunAsOf ?? addDays(date, -7) + "T00:00:00.000Z";
  const changes: AnnouncedChange[] = progression.transitions
    .filter((t) => isChange(t) && t.causeRecordedAt > cutoff)
    .map((t) => announceTransition(t, input.schedule));
  if (targetChange) {
    changes.push({
      id: `calories:${date}`,
      kind: "calories",
      title: calorieChangeTitle(targetChange.from, targetChange.to),
      reason: targetChange.reason,
      rule: targetChange.rule,
      effective: date,
      track: null,
      from: targetChange.from.kcal,
      to: targetChange.to.kcal,
      cited: [],
    });
  }

  const bests: Record<string, LiftBests> = computeBests(input.sets, bodyweight, rules, date);
  const newIds = new Set(input.sets.filter((s) => s.recordedAt > cutoff).map((s) => s.id));
  const bestEvents = Object.values(bests)
    .flatMap((b) => b.events)
    .filter((e) => newIds.has(e.set.setId));

  // ---- Missing data, shown as missing ----
  const missing: string[] = [];
  if (!todayWeigh || todayWeigh.weight === null) missing.push("No weigh-in this morning. Today's reading is left out of the average.");
  else if (!todayWeigh.protocolOk) missing.push("This morning's weigh-in was outside the fixed conditions, so it isn't in the average.");
  if (sleep === null) missing.push("Last night's sleep isn't logged.");
  if (!yTotals) missing.push(`No Cronometer totals for ${fmtShort(yesterday)}.`);
  if (isMonday && waistToday === null && phase !== "pre") missing.push("Monday waist not logged yet. The calorie rules need it.");
  const yesterdayPlan = dayPlan(yesterday, input.schedule);
  if (yesterdayPlan.kind === "train" && !yesterdayPlan.optionalDay) {
    const logged = input.sets.some((s) => s.date === yesterday);
    if (!logged) missing.push(`No session logged for ${fmtShort(yesterday)} (${yesterdayPlan.session.name}). Those lifts repeat unchanged.`);
  }

  const feedback = dailyFeedback(yTotals, yesterdayTarget, rules);
  const replayDue = firstMonday;

  const note = composeNote({
    date,
    card,
    gate,
    changes,
    calorieChange,
    weekly,
    monthly,
    feedback,
    missing,
    bestEvents,
    bests,
    sevenDayAvg: sevenDay.avg,
    weeklyChange,
    phase2Reached,
    replayDue,
  });

  return {
    version: 1,
    meta: { asOf: input.asOf, previousRunAsOf: input.previousRunAsOf },
    date,
    week: weekNumber(date),
    phase,
    phaseLabel: PHASE_LABEL[phase],
    rulesVersion: rules.version,
    card,
    gate,
    morning: {
      weight: todayWeigh?.weight ?? null,
      protocolOk: todayWeigh ? todayWeigh.protocolOk : null,
      sevenDay,
      previousSevenDay,
      weeklyChange,
      sleepMinutes: sleep,
      waistToday,
      waistDue: isMonday,
    },
    targets: { current: lite(current), change: targetChange },
    yesterday: { date: yesterday, totals: yTotals, feedback },
    weekly,
    monthly,
    replayDue,
    changes,
    bestEvents,
    phase2: { reached: phase2Reached, avg: sevenDay.avg },
    missing,
    note,
    states: progression.states,
    baselines: progression.baselines,
  };
}

/** A stable fingerprint of what a run depended on. Same digest, same output. */
export function inputsDigest(input: EngineInput): string {
  const j = (x: unknown) => JSON.stringify(x);
  const parts = [
    input.date,
    input.rules.version,
    stableStringify(input.gym),
    stableStringify(input.schedule),
    input.previousRunAsOf ?? "",
    ...input.weighIns.map((w) => `w${j([w.id, w.recordedAt, w.date, w.weight, w.protocolOk, w.bedAt, w.wakeAt])}`),
    ...input.nutrition.map((n) => `n${j([n.id, n.recordedAt, n.date, n.kcal, n.protein, n.carbs, n.fat, n.note])}`),
    ...input.measurements.map((m) => `m${j([m.id, m.recordedAt, m.date, m.kind, m.valueCm])}`),
    ...input.sets.map((s) => `s${j([s.id, s.recordedAt, s.date, s.track, s.exercise, s.slot, s.setIndex, s.weight, s.reps, s.isWarmup])}`),
    ...input.overrides.map((o) => `o${j([o.id, o.recordedAt, o.date, o.target, o.field, stableStringify(o.value)])}`),
    ...input.targets.map((t) => `t${j([t.id, t.recordedAt, t.effectiveDate, t.kcal, t.protein, t.carbs, t.fat, t.source])}`),
  ].sort();
  // Two FNV-1a 32-bit hashes with different seeds, as 16 hex characters.
  // Not for security; only change detection.
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ 0x5bd1e995;
  for (const p of parts) {
    for (let i = 0; i < p.length; i++) {
      const c = p.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
      h2 = Math.imul(h2 ^ c, 0x01000193) >>> 0;
    }
    h1 = Math.imul(h1 ^ 0x2c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ 0x3b, 0x01000193) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

/** JSON with object keys sorted, so values read back from jsonb compare equal. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v === undefined ? null : v)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}
