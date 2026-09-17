// Deterministic progression. The state of every lift is rebuilt from the log on
// each run: the log is the source of truth, the state table is a cache.
// A lift failed three weeks ago is a row here, not a memory.
import { sameWeek } from "@/lib/time";
import { DEFAULT_GYM, fmtKg, stepFor, toLoadable, type GymSettings } from "./equipment";
import {
  EXERCISES,
  exercise,
  loadModeOf,
  parseSubstituteTrack,
  schemeForTrack,
  TRACKS,
  type ExerciseDef,
  type SlotDef,
} from "./program";
import type { RuleSet } from "./rules";
import { isRampIn, slotSets } from "./schedule";

export interface LoggedSet {
  id: string;
  date: string;
  sessionId: string;
  slot: string;
  exercise: string;
  track: string;
  setIndex: number;
  weight: number | null;
  reps: number;
  isWarmup: boolean;
  recordedAt: string;
}

export interface OverrideEvent {
  id: string;
  date: string;
  recordedAt: string;
  target: string;
  field: "weight" | "reps" | "targets";
  value: unknown;
  reason: string;
}

export interface TrackState {
  track: string;
  exercise: string;
  status: "unset" | "active";
  weight: number | null;
  repTargets: number[];
  successes: number;
  misses: number;
  lastDeload: string | null;
  lastLoadChange: string | null;
  lastSession: string | null;
  lastSets: { weight: number | null; reps: number }[];
  seed: "baseline" | "log" | "override" | "derived" | null;
}

export type TransitionKind =
  | "seed"
  | "increase"
  | "hold"
  | "top"
  | "miss"
  | "deload"
  | "follow_log"
  | "blocked_week"
  | "override";

export interface Transition {
  id: string;
  track: string;
  exercise: string;
  date: string;
  causeRecordedAt: string;
  kind: TransitionKind;
  from: { weight: number | null; reps: number[] } | null;
  to: { weight: number | null; reps: number[] };
  rule: string;
  cited: string[];
  reason: string;
}

/** A load change the athlete should see in the changelog. */
export function isChange(t: Transition): boolean {
  return t.kind === "seed" || t.kind === "increase" || t.kind === "deload" || t.kind === "follow_log" || t.kind === "override";
}

export class RuleAssertionError extends Error {
  constructor(
    readonly rule: string,
    message: string,
  ) {
    super(`[${rule}] ${message}`);
    this.name = "RuleAssertionError";
  }
}

/** Epley estimate. Reps above 1 only; a single is the load itself. */
export function epley(weight: number, reps: number): number {
  if (reps <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

/** Load that should allow `reps` with `rir` in reserve, given an estimated max. */
export function loadForReps(e1rm: number, reps: number, rir: number): number {
  return e1rm / (1 + (reps + rir) / 30);
}

export type BodyweightLookup = (date: string) => { kg: number; source: "logged" | "profile" };

const PROFILE_BODYWEIGHT = 57.5;

/** Bodyweight on a date: latest protocol weigh-in on or before it, else the first after, else the profile. */
export function makeBodyweightLookup(weighIns: { date: string; weight: number | null; protocolOk: boolean }[]): BodyweightLookup {
  const valid = weighIns
    .filter((w) => w.weight !== null && w.protocolOk)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return (date) => {
    let best: number | null = null;
    for (const w of valid) {
      if (w.date <= date) best = w.weight;
      else break;
    }
    if (best !== null) return { kg: best, source: "logged" };
    if (valid.length) return { kg: valid[0].weight as number, source: "logged" };
    return { kg: PROFILE_BODYWEIGHT, source: "profile" };
  };
}

/** Total load moved in a set: bodyweight lifts add the athlete's weight. */
export function totalLoad(ex: ExerciseDef, weight: number | null, date: string, bw: BodyweightLookup): number | null {
  const mode = loadModeOf(ex);
  if (mode === "none") return null;
  if (mode === "added") return bw(date).kg + (weight ?? 0);
  return weight;
}

function emptyState(track: string, exerciseKey: string): TrackState {
  return {
    track,
    exercise: exerciseKey,
    status: "unset",
    weight: null,
    repTargets: [],
    successes: 0,
    misses: 0,
    lastDeload: null,
    lastLoadChange: null,
    lastSession: null,
    lastSets: [],
    seed: null,
  };
}

function exerciseForTrack(track: string): string | null {
  const sub = parseSubstituteTrack(track);
  if (sub) return sub.exercise;
  return TRACKS[track]?.slot.exercise ?? null;
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function mode<T>(values: T[], prefer: T | null): T {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const max = Math.max(...counts.values());
  const tied = [...counts.entries()].filter(([, c]) => c === max).map(([v]) => v);
  if (tied.length === 1) return tied[0];
  if (prefer !== null && tied.includes(prefer)) return prefer;
  return [...tied].sort((a, b) => Number(a) - Number(b))[0];
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function nextRepTargets(reps: number[], n: number, lo: number, hi: number): number[] {
  return Array.from({ length: n }, (_, i) => (i < reps.length ? clamp(reps[i] + 1, lo, hi) : lo));
}

function repsText(reps: number[]): string {
  if (reps.length === 0) return "no sets";
  return reps.join(", ");
}

/** Groups of tracks that share one baseline test. */
export const BASELINE_GROUPS: Record<string, string[]> = {
  bench: ["bench_heavy", "bench_volume"],
  ohp: ["ohp"],
  pullup: ["pullup_weighted", "pullup_bw"],
  squat: ["back_squat"],
  rdl: ["rdl"],
};

const TRACK_TO_BASELINE_GROUP: Record<string, string> = Object.fromEntries(
  Object.entries(BASELINE_GROUPS).flatMap(([g, tracks]) => tracks.map((t) => [t, g])),
);

export function baselineGroupOf(track: string): string | null {
  return TRACK_TO_BASELINE_GROUP[track] ?? null;
}

export interface Baseline {
  group: string;
  date: string;
  e1rm: number;
  /** Heaviest load lifted for the test reps (total load for pull-ups). */
  testLoad: number;
  cited: string[];
  causeRecordedAt: string;
}

export interface ProgressionInput {
  sets: LoggedSet[];
  overrides: OverrideEvent[];
  gym?: GymSettings;
  bodyweight: BodyweightLookup;
  /**
   * The run day. Sessions dated before it are applied (tonight's session happens
   * after the card); overrides dated on or before it are applied (an override
   * made today changes tonight's card).
   */
  before: string;
  rules: RuleSet;
}

export interface ProgressionResult {
  states: Record<string, TrackState>;
  transitions: Transition[];
  baselines: Record<string, Baseline>;
}

type Event =
  | { kind: "override"; date: string; order: 0; key: string; ov: OverrideEvent }
  | { kind: "session"; date: string; order: 1; key: string; track: string; sets: LoggedSet[] };

export function computeProgression(input: ProgressionInput): ProgressionResult {
  const gym = input.gym ?? DEFAULT_GYM;
  const { rules, bodyweight } = input;
  const states: Record<string, TrackState> = {};
  const transitions: Transition[] = [];
  const baselines: Record<string, Baseline> = {};

  const state = (track: string): TrackState | null => {
    if (!states[track]) {
      const exKey = exerciseForTrack(track);
      if (!exKey || !EXERCISES[exKey]) return null;
      states[track] = emptyState(track, exKey);
    }
    return states[track];
  };

  // ---- Collect events -------------------------------------------------------
  const usable = input.sets.filter(
    (s) => s.date < input.before && !isRampIn(s.date) && !s.isWarmup && schemeForTrack(s.track) !== null,
  );
  const byKey = new Map<string, LoggedSet[]>();
  for (const s of usable) {
    const k = `${s.date}|${s.track}`;
    const list = byKey.get(k);
    if (list) list.push(s);
    else byKey.set(k, [s]);
  }
  const events: Event[] = [];
  for (const [k, sets] of byKey) {
    const [date, track] = k.split("|");
    sets.sort((a, b) => a.setIndex - b.setIndex || cmp(a.recordedAt, b.recordedAt) || cmp(a.id, b.id));
    events.push({ kind: "session", date, order: 1, key: `${track}|${sets[0].id}`, track, sets });
  }
  for (const ov of input.overrides) {
    if (ov.date > input.before) continue;
    events.push({ kind: "override", date: ov.date, order: 0, key: `${ov.recordedAt}|${ov.id}`, ov });
  }
  events.sort((a, b) => cmp(a.date, b.date) || a.order - b.order || cmp(a.key, b.key));

  const push = (t: Omit<Transition, "id">) => {
    transitions.push({ ...t, id: `${t.track}:${t.date}:${t.kind}:${transitions.length}` });
  };

  const maxRecorded = (sets: { recordedAt: string }[]) => sets.map((s) => s.recordedAt).sort(cmp).at(-1) ?? "";

  // ---- Baseline handling ----------------------------------------------------
  const recordBaseline = (group: string, date: string, sets: LoggedSet[]) => {
    const ex = exercise(sets[0].exercise);
    let best: { e1rm: number; load: number; set: LoggedSet } | null = null;
    for (const s of sets) {
      if (s.reps < rules.baseline.minRepsForEstimate) continue;
      const load = totalLoad(ex, s.weight, s.date, bodyweight);
      if (load === null) continue;
      const e = epley(load, s.reps + rules.baseline.assumedRir);
      if (!best || e > best.e1rm + 1e-9) best = { e1rm: e, load, set: s };
    }
    if (!best) return;
    const prev = baselines[group];
    // Several baseline sessions in the week: the strongest estimate wins.
    if (prev && prev.e1rm >= best.e1rm) return;
    baselines[group] = {
      group,
      date,
      e1rm: best.e1rm,
      testLoad: best.load,
      cited: sets.map((s) => s.id),
      causeRecordedAt: maxRecorded(sets),
    };
    for (const track of BASELINE_GROUPS[group]) seedFromBaseline(track, baselines[group], date);
  };

  const seedFromBaseline = (track: string, b: Baseline, date: string) => {
    const st = state(track);
    const slot = schemeForTrack(track);
    if (!st || !slot) return;
    const ex = exercise(st.exercise);
    const [lo] = slot.reps;
    let weight: number;
    const targetTotal = loadForReps(b.e1rm, lo, rirOf(slot));
    if (loadModeOf(ex) === "added") {
      weight = toLoadable(ex, targetTotal - bodyweight(date).kg, gym, "down");
    } else {
      weight = toLoadable(ex, targetTotal, gym, "down");
    }
    const from = st.status === "active" ? { weight: st.weight, reps: st.repTargets } : null;
    const n = slot.sets;
    st.status = "active";
    st.weight = weight;
    st.repTargets = Array(n).fill(lo);
    st.successes = 0;
    st.misses = 0;
    st.seed = "baseline";
    st.lastLoadChange = date;
    push({
      track,
      exercise: st.exercise,
      date,
      causeRecordedAt: b.causeRecordedAt,
      kind: "seed",
      from,
      to: { weight, reps: st.repTargets },
      rule: "B1",
      cited: b.cited,
      reason: `Baseline estimate ${fmtKg(Math.round(b.e1rm * 10) / 10)} kg max → ${fmtKg(weight)} kg for ${lo}+ reps.`,
    });
  };

  // ---- Walk the events --------------------------------------------------------
  for (const ev of events) {
    if (ev.kind === "override") {
      applyOverride(ev.ov);
      continue;
    }
    const { track, sets, date } = ev;
    const st = state(track);
    const slot = schemeForTrack(track);
    if (!st || !slot || slot.percentOfMax) continue;
    const ex = exercise(st.exercise);
    const group = parseSubstituteTrack(track) ? null : baselineGroupOf(track);

    // Baseline lifts: the first session of the lift (normally in week 3) is the 8-rep test.
    if (group && !baselines[group]) {
      recordBaseline(group, date, sets);
      st.lastSession = date;
      st.lastSets = sets.map((s) => ({ weight: s.weight, reps: s.reps }));
      continue;
    }

    const [lo, hi] = slot.reps;
    const n = slotSets(slot, date) ?? slot.sets;
    const mode_ = loadModeOf(ex);
    const cited = sets.map((s) => s.id);
    const causeRecordedAt = maxRecorded(sets);

    // First working session of an accessory: it seeds the load, then is judged like any other.
    if (st.status === "unset") {
      if (mode_ === "none") {
        st.status = "active";
        st.weight = null;
        st.seed = "log";
      } else {
        const qualifying = sets.filter((s) => s.reps >= lo && s.weight !== null).map((s) => s.weight as number);
        const seedWeight = qualifying.length
          ? Math.max(...qualifying)
          : (sets.filter((s) => s.weight !== null).sort((a, b) => epley(b.weight!, b.reps) - epley(a.weight!, a.reps))[0]
              ?.weight ?? null);
        if (seedWeight === null) continue;
        st.status = "active";
        st.weight = seedWeight;
        st.seed = "log";
        push({
          track,
          exercise: st.exercise,
          date,
          causeRecordedAt,
          kind: "seed",
          from: null,
          to: { weight: seedWeight, reps: Array(n).fill(lo) },
          rule: "B2",
          cited,
          reason: `First working session: ${fmtKg(seedWeight)} kg is the starting load.`,
        });
      }
    }

    const before = { weight: st.weight, reps: [...st.repTargets] };

    // The log is truth: judge the session at the load actually lifted.
    let atWeight = sets;
    if (mode_ !== "none") {
      const weights = sets.map((s) => s.weight ?? 0);
      const lifted = mode(weights, st.weight);
      atWeight = sets.filter((s) => (s.weight ?? 0) === lifted);
      if (st.weight !== null && Math.abs(lifted - st.weight) > 1e-9) {
        const wentUp = lifted > st.weight;
        push({
          track,
          exercise: st.exercise,
          date,
          causeRecordedAt,
          kind: "follow_log",
          from: { weight: st.weight, reps: st.repTargets },
          to: { weight: lifted, reps: st.repTargets },
          rule: "P4",
          cited,
          reason: `The card said ${fmtKg(st.weight)} kg; you lifted ${fmtKg(lifted)} kg, so the next target follows the log.`,
        });
        st.weight = lifted;
        st.successes = 0;
        if (wentUp) st.misses = 0;
        st.lastLoadChange = date;
      }
    }

    const reps = atWeight.map((s) => s.reps);
    const done = reps.slice(0, n);
    const success = reps.length >= n && done.every((r) => r >= hi);
    const miss = reps.some((r) => r < lo);

    st.lastSession = date;
    st.lastSets = sets.map((s) => ({ weight: s.weight, reps: s.reps }));

    if (success) {
      if (mode_ === "none") {
        st.successes += 1;
        st.misses = 0;
        st.repTargets = Array(n).fill(hi);
        push({
          track, exercise: st.exercise, date, causeRecordedAt, kind: "top", from: before,
          to: { weight: null, reps: st.repTargets }, rule: "P2", cited,
          reason: `${n === 1 ? "The set" : `All ${n} sets`} reached ${hi}. Top of the range: slow the lowering rather than adding reps.`,
        });
        continue;
      }
      if (st.lastLoadChange && sameWeek(st.lastLoadChange, date)) {
        st.successes += 1;
        st.misses = 0;
        st.repTargets = Array(n).fill(hi);
        push({
          track, exercise: st.exercise, date, causeRecordedAt, kind: "blocked_week", from: before,
          to: { weight: st.weight, reps: st.repTargets }, rule: "P5", cited,
          reason: `All sets reached ${hi}, but the load already changed this week. It goes up next time.`,
        });
        continue;
      }
      const step = stepFor(ex, gym);
      const current = st.weight ?? 0;
      // Down, so a load left off-grid by a gym change still moves by at most one step.
      const next = toLoadable(ex, current + step, gym, "down");
      if (next - current > step + 1e-9) {
        throw new RuleAssertionError("P6", `${track}: ${current} → ${next} exceeds one step (${step} kg).`);
      }
      if (next <= current) {
        // At the top of the available range (e.g. heaviest dumbbell): hold and say so.
        st.repTargets = Array(n).fill(hi);
        push({
          track, exercise: st.exercise, date, causeRecordedAt, kind: "top", from: before,
          to: { weight: current, reps: st.repTargets }, rule: "P2", cited,
          reason: `All sets reached ${hi}, and ${fmtKg(current)} kg is the heaviest load set up for this station.`,
        });
        continue;
      }
      st.weight = next;
      st.repTargets = Array(n).fill(lo);
      st.successes += 1;
      st.misses = 0;
      st.lastLoadChange = date;
      push({
        track, exercise: st.exercise, date, causeRecordedAt, kind: "increase", from: { weight: current, reps: before.reps },
        to: { weight: next, reps: st.repTargets }, rule: "P1", cited,
        reason: `${n === 1 ? "The set" : `All ${n} sets`} reached ${hi} reps at ${fmtKg(current)} kg (${repsText(done)}).`,
      });
      continue;
    }

    if (miss) {
      st.misses += 1;
      st.successes = 0;
      const canDeload = mode_ !== "none" && st.misses >= rules.progression.missesBeforeDeload;
      const blocked = st.lastLoadChange !== null && sameWeek(st.lastLoadChange, date);
      if (canDeload && !blocked) {
        const current = st.weight ?? 0;
        const step = stepFor(ex, gym);
        let next = toLoadable(ex, current * (1 - rules.progression.deloadFraction), gym, "down");
        if (next > current - step) next = toLoadable(ex, current - step, gym, "down");
        if (current - next > current * rules.progression.maxDeloadFraction + step + 1e-9) {
          throw new RuleAssertionError("P3", `${track}: deload ${current} → ${next} is larger than allowed.`);
        }
        st.weight = next;
        st.misses = 0;
        st.lastDeload = date;
        st.lastLoadChange = date;
        st.repTargets = Array(n).fill(lo);
        push({
          track, exercise: st.exercise, date, causeRecordedAt, kind: "deload", from: { weight: current, reps: before.reps },
          to: { weight: next, reps: st.repTargets }, rule: "P3", cited,
          reason: `Third session in a row with a set under ${lo} reps (${repsText(reps)}). Back off 10% and build again.`,
        });
      } else {
        st.repTargets = nextRepTargets(reps, n, lo, hi);
        push({
          track, exercise: st.exercise, date, causeRecordedAt, kind: "miss", from: before,
          to: { weight: st.weight, reps: st.repTargets }, rule: "P3", cited,
          reason: `A set fell under ${lo} reps (${repsText(reps)}). Same load; miss ${st.misses} of ${rules.progression.missesBeforeDeload}${canDeload && blocked ? ", deload waits for next week" : ""}.`,
        });
      }
      continue;
    }

    st.successes = 0;
    st.misses = 0;
    st.repTargets = nextRepTargets(reps, n, lo, hi);
    push({
      track, exercise: st.exercise, date, causeRecordedAt, kind: "hold", from: before,
      to: { weight: st.weight, reps: st.repTargets }, rule: "P2", cited,
      reason: reps.length < n
        ? `${reps.length} of ${n} sets logged (${repsText(reps)}). Same load, finish all sets next time.`
        : `Inside the range (${repsText(reps)}). Same load, one more rep per set.`,
    });
  }

  return { states, transitions, baselines };

  function applyOverride(ov: OverrideEvent) {
    const m = /^track:(.+)$/.exec(ov.target);
    if (!m) return;
    const track = m[1];
    const st = state(track);
    const slot = schemeForTrack(track);
    if (!st || !slot) return;
    const ex = exercise(st.exercise);
    const [lo, hi] = slot.reps;
    const n = slotSets(slot, ov.date) ?? slot.sets;
    const before = st.status === "active" ? { weight: st.weight, reps: [...st.repTargets] } : null;
    if (ov.field === "weight") {
      const raw = Number(ov.value);
      if (!Number.isFinite(raw) || raw < 0) return;
      const weight = loadModeOf(ex) === "none" ? null : toLoadable(ex, raw, gym, "nearest");
      st.status = "active";
      st.weight = weight;
      st.repTargets = Array(n).fill(lo);
      st.successes = 0;
      st.misses = 0;
      st.seed = st.seed ?? "override";
      st.lastLoadChange = ov.date;
    } else if (ov.field === "reps") {
      const list = Array.isArray(ov.value) ? ov.value.map(Number) : Array(n).fill(Number(ov.value));
      if (list.some((r) => !Number.isFinite(r))) return;
      st.repTargets = Array.from({ length: n }, (_, i) => clamp(Math.round(list[i] ?? list[list.length - 1]), lo, hi));
      if (st.status === "unset") return;
    } else {
      return;
    }
    push({
      track,
      exercise: st.exercise,
      date: ov.date,
      causeRecordedAt: ov.recordedAt,
      kind: "override",
      from: before,
      to: { weight: st.weight, reps: st.repTargets },
      rule: "O1",
      cited: [ov.id],
      reason: ov.reason ? `You set it: ${ov.reason}` : "You set it by hand.",
    });
  }
}

function rirOf(slot: SlotDef): number {
  const nums = slot.rir.match(/\d+(\.\d+)?/g)?.map(Number) ?? [];
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 2;
}

/** Current estimated max for a baseline group, from recent working sets or the baseline. */
export function estimatedMax(
  group: string,
  sets: LoggedSet[],
  baselines: Record<string, Baseline>,
  before: string,
  lookbackDays: number,
  bodyweight: BodyweightLookup,
): { e1rm: number; source: "sets" | "baseline"; date: string } | null {
  const tracks = new Set(BASELINE_GROUPS[group] ?? []);
  const from = new Date(Date.parse(`${before}T00:00:00Z`) - lookbackDays * 86_400_000).toISOString().slice(0, 10);
  let best: { e1rm: number; date: string } | null = null;
  for (const s of sets) {
    if (!tracks.has(s.track) || s.isWarmup || s.date >= before || s.date < from || isRampIn(s.date)) continue;
    if (s.reps < 1 || s.reps > 12) continue;
    const ex = EXERCISES[s.exercise];
    if (!ex) continue;
    const load = totalLoad(ex, s.weight, s.date, bodyweight);
    if (load === null) continue;
    const e = epley(load, s.reps);
    if (!best || e > best.e1rm) best = { e1rm: e, date: s.date };
  }
  const b = baselines[group];
  if (best && (!b || best.e1rm >= b.e1rm || best.date > b.date)) return { ...best, source: "sets" };
  if (b) return { e1rm: b.e1rm, source: "baseline", date: b.date };
  return best ? { ...best, source: "sets" } : null;
}
