// Rep and load bests inside 6–12 reps, per lift. Lifts with a Dec 2025 peak
// report "regain" until the old peak is passed; only then do true PRs start,
// so comeback gains don't fire a PR every session.
import { EXERCISES, exercise, PEAKS } from "./program";
import { epley, totalLoad, type BodyweightLookup, type LoggedSet } from "./progression";
import type { RuleSet } from "./rules";
import { isRampIn } from "./schedule";

export interface BestSet {
  setId: string;
  exercise: string;
  date: string;
  weight: number | null;
  reps: number;
  load: number;
  e1rm: number;
}

export type BestKind = "regain" | "peak" | "pr" | "best";

export interface BestEvent {
  kind: BestKind;
  measure: "e1rm" | "reps";
  group: string;
  set: BestSet;
  previous: number;
}

export interface LiftBests {
  group: string;
  name: string;
  best: BestSet | null;
  byReps: Record<number, BestSet>;
  peak: { e1rm: number; label: string } | null;
  peakPassed: boolean;
  regainPct: number | null;
  events: BestEvent[];
}

export function groupOf(exerciseKey: string): string {
  const ex = EXERCISES[exerciseKey];
  return ex?.liftGroup ?? exerciseKey;
}

const GROUP_NAMES: Record<string, string> = {
  bench: "Bench press",
  pullup: "Weighted pull-up",
  ohp: "Overhead press",
  squat: "Back squat",
  rdl: "Romanian deadlift",
  deadlift: "Deadlift",
};

export function groupName(group: string): string {
  return GROUP_NAMES[group] ?? EXERCISES[group]?.name ?? group;
}

export function computeBests(
  sets: LoggedSet[],
  bodyweight: BodyweightLookup,
  rules: RuleSet,
  before?: string,
): Record<string, LiftBests> {
  const out: Record<string, LiftBests> = {};
  const ordered = [...sets]
    .filter((s) => !s.isWarmup && !isRampIn(s.date) && (!before || s.date < before))
    .filter((s) => s.reps >= rules.bests.minReps && s.reps <= rules.bests.maxReps)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.recordedAt < b.recordedAt ? -1 : a.recordedAt > b.recordedAt ? 1 : a.setIndex - b.setIndex));

  for (const s of ordered) {
    const ex = EXERCISES[s.exercise];
    if (!ex) continue;
    const load = totalLoad(exercise(s.exercise), s.weight, s.date, bodyweight);
    if (load === null || load <= 0) continue;
    const group = groupOf(s.exercise);
    const peak = PEAKS[group] ?? null;
    const lb = (out[group] ??= {
      group,
      name: groupName(group),
      best: null,
      byReps: {},
      peak,
      peakPassed: false,
      regainPct: null,
      events: [],
    });
    const set: BestSet = {
      setId: s.id,
      exercise: s.exercise,
      date: s.date,
      weight: s.weight,
      reps: s.reps,
      load: Math.round(load * 100) / 100,
      e1rm: Math.round(epley(load, s.reps) * 10) / 10,
    };

    const kindFor = (e1rm: number): BestKind => {
      if (!peak) return "best";
      if (e1rm >= peak.e1rm) return lb.peakPassed ? "pr" : "peak";
      return "regain";
    };

    // Estimated-max best.
    if (!lb.best) {
      lb.best = set;
      if (peak && set.e1rm >= peak.e1rm) lb.peakPassed = true;
    } else if (set.e1rm > lb.best.e1rm + 1e-9) {
      const kind = kindFor(set.e1rm);
      lb.events.push({ kind, measure: "e1rm", group, set, previous: lb.best.e1rm });
      lb.best = set;
      if (kind === "peak") lb.peakPassed = true;
    }

    // Rep best: more load at the same rep count.
    const prev = lb.byReps[s.reps];
    if (!prev) {
      lb.byReps[s.reps] = set;
    } else if (set.load > prev.load + 1e-9) {
      lb.byReps[s.reps] = set;
      const already = lb.events.at(-1)?.set.setId === set.setId;
      if (!already) lb.events.push({ kind: kindFor(set.e1rm), measure: "reps", group, set, previous: prev.load });
    }
  }

  for (const lb of Object.values(out)) {
    if (lb.peak && lb.best) lb.regainPct = Math.min(100, Math.round((lb.best.e1rm / lb.peak.e1rm) * 100));
  }
  return out;
}

export function bestEventText(ev: BestEvent): string {
  const name = groupName(ev.group);
  const ex = exercise(ev.set.exercise);
  const w = ex.equipment === "belt" ? `+${ev.set.weight ?? 0}` : `${ev.set.weight}`;
  const lift = `${w} kg × ${ev.set.reps}`;
  switch (ev.kind) {
    case "peak":
      return `${name}: past your Dec 2025 peak (${lift}, est. max ${ev.set.e1rm} kg). PRs start now.`;
    case "pr":
      return `${name} PR: ${lift} (est. max ${ev.set.e1rm} kg).`;
    case "regain":
      return `${name} regain best: ${lift} (est. max ${ev.set.e1rm} kg).`;
    default:
      return ev.measure === "reps" ? `${name} best at ${ev.set.reps} reps: ${lift}.` : `${name} best: ${lift} (est. max ${ev.set.e1rm} kg).`;
  }
}
