// The workout card: exercise, sets, reps and load prefilled, with one substitute
// per exercise. The card is a target; the log is truth.
import { fmtShort } from "@/lib/time";
import { fmtKg, plateDiff, stepFor, toLoadable, type GymSettings } from "./equipment";
import {
  exercise,
  LOAD_HINT,
  loadModeOf,
  ONE_RM_ALLOWED_FROM,
  restSeconds,
  substituteTrack,
  type Equipment,
  type LoadMode,
  type SessionDef,
} from "./program";
import {
  baselineGroupOf,
  estimatedMax,
  isChange,
  RuleAssertionError,
  type Baseline,
  type BodyweightLookup,
  type LoggedSet,
  type Transition,
  type TrackState,
} from "./progression";
import { withinDeloadWindow, type Gate } from "./readiness";
import type { RuleSet } from "./rules";
import { dayPlan, isRampIn, PHASE_LABEL, slotSets, type DayPlan, type Phase, type ScheduleSettings } from "./schedule";

export type SlotStatus = "working" | "baseline_test" | "choose_load" | "percent" | "reps_only" | "rampin";

export interface CardExercise {
  key: string;
  name: string;
  equipment: Equipment;
  loadMode: LoadMode;
  loadHint: string;
  cue: string;
  station: string | null;
  perSide: boolean;
}

export interface CardSubstitute {
  exercise: CardExercise;
  track: string;
  step: number;
  weight: number | null;
  repTargets: number[];
}

export interface CardSlot {
  slot: string;
  label: string;
  exercise: CardExercise;
  track: string;
  status: SlotStatus;
  sets: number;
  reps: [number, number];
  repTargets: number[];
  rir: string;
  rest: string;
  restSeconds: number;
  weight: number | null;
  step: number;
  plates: { kg: number; fresh: boolean }[] | null;
  change: { from: number | null; to: number | null; rule: string; reason: string; date: string } | null;
  why: string;
  bestSetAllowed: boolean;
  substitute: CardSubstitute | null;
  optional: boolean;
  supersetWith: string | null;
  note: string | null;
  hint: string | null;
}

export interface Card {
  date: string;
  week: number;
  phase: Phase;
  phaseLabel: string;
  kind: "train" | "rest";
  restReason: string | null;
  session: { key: string; name: string; focus: string; minutes: number; cardio: string | null } | null;
  optionalDay: boolean;
  slots: CardSlot[];
  totalSets: number;
  notes: string[];
}

function cardExercise(key: string): CardExercise {
  const d = exercise(key);
  return {
    key: d.key,
    name: d.name,
    equipment: d.equipment,
    loadMode: loadModeOf(d),
    loadHint: LOAD_HINT[d.equipment],
    cue: d.cue,
    station: d.station ?? null,
    perSide: !!d.perSide,
  };
}

function fit(reps: number[], n: number, lo: number): number[] {
  return Array.from({ length: n }, (_, i) => reps[i] ?? lo);
}

function lastRampInHint(sets: LoggedSet[], exerciseKey: string, before: string): string | null {
  const ramp = sets
    .filter((s) => s.exercise === exerciseKey && s.date < before && isRampIn(s.date) && !s.isWarmup)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.setIndex - a.setIndex));
  const s = ramp[0];
  if (!s) return null;
  const w = s.weight === null ? "" : `${fmtKg(s.weight)} kg × `;
  return `Last ramp-in set: ${w}${s.reps} on ${fmtShort(s.date)}.`;
}

export interface BuildCardInput {
  date: string;
  schedule: ScheduleSettings;
  gym: GymSettings;
  rules: RuleSet;
  states: Record<string, TrackState>;
  transitions: Transition[];
  baselines: Record<string, Baseline>;
  sets: LoggedSet[];
  gate: Gate;
  bodyweight: BodyweightLookup;
}

export function buildCard(input: BuildCardInput): Card {
  const plan: DayPlan = dayPlan(input.date, input.schedule);
  const base = {
    date: input.date,
    week: plan.week,
    phase: plan.phase,
    phaseLabel: PHASE_LABEL[plan.phase],
  };
  if (plan.kind === "rest") {
    const restReason =
      plan.reason === "pre"
        ? "The program starts on Mon 7 Sep."
        : plan.reason === "build-rest"
          ? "Weeks 3–4 run five days. Rest today; the full six days start Mon 5 Oct."
          : plan.reason === "moved"
            ? `Today's session moved to ${fmtShort(plan.movedTo!)}. Rest today.`
            : plan.reason === "skipped"
              ? "Session skipped. Its lifts repeat unchanged next time."
              : "Rest day: a 30–40 minute walk outside.";
    return { ...base, kind: "rest", restReason, session: null, optionalDay: false, slots: [], totalSets: 0, notes: [] };
  }

  const session: SessionDef = plan.session;
  const notes: string[] = [];
  if (plan.movedFrom) notes.push(`Moved here from ${fmtShort(plan.movedFrom)}.`);
  if (plan.phase === "rampin") {
    notes.push("Ramp-in with your trainer: 3–4 days this week, about 50–60% of expected loads, 2 sets each, stop 4–5 reps short. Log what you did; it is kept but doesn't drive progression.");
  } else if (plan.phase === "baseline") {
    notes.push("Baseline week: on bench, overhead press, pull-ups, squat and RDL, work up to the weight you can lift for 8 clean reps with about 2 left. Log every set. No max testing.");
  }

  // The latest rule event per lift. A change chip shows only when that event
  // changed the load, i.e. tonight's load differs from the last session's.
  const latestAny = new Map<string, Transition>();
  for (const t of input.transitions) latestAny.set(t.track, t);

  const slots: CardSlot[] = [];
  for (const def of session.slots) {
    const n = slotSets(def, input.date);
    if (n === null) continue;
    const ex = exercise(def.exercise);
    const mode = loadModeOf(ex);
    const [lo, hi] = def.reps;
    const st = input.states[def.track];
    const step = stepFor(ex, input.gym);
    let status: SlotStatus;
    let weight: number | null = null;
    let repTargets = Array(n).fill(lo);
    let why = "";
    let hint: string | null = null;
    let change: CardSlot["change"] = null;
    const group = baselineGroupOf(def.track);

    if (plan.phase === "rampin") {
      status = "rampin";
      repTargets = Array(n).fill(lo);
      why = `Ramp-in: ${n} light sets (about 50–60% of expected), stopping 4–5 reps short of failure.`;
      hint = lastRampInHint(input.sets, ex.key, input.date);
    } else if (def.percentOfMax) {
      status = "percent";
      const max = estimatedMax("bench", input.sets, input.baselines, input.date, input.rules.speedBench.lookbackDays, input.bodyweight);
      repTargets = Array(n).fill(lo);
      if (max) {
        weight = toLoadable(ex, max.e1rm * def.percentOfMax, input.gym, "down");
        why = `${Math.round(def.percentOfMax * 100)}% of your estimated bench max (${fmtKg(Math.round(max.e1rm * 10) / 10)} kg${max.source === "baseline" ? ", from the baseline" : ""}). Speed, not effort.`;
      } else {
        why = `About ${Math.round(def.percentOfMax * 100)}% of your bench max. No bench numbers yet, so keep it light and fast.`;
      }
    } else if (def.track === "deadlift" && (!st || st.status === "unset")) {
      status = "working";
      const rdl = input.baselines.rdl;
      repTargets = Array(n).fill(lo);
      if (rdl) {
        const eightRep = rdl.testLoad;
        weight = toLoadable(ex, eightRep * input.rules.baseline.deadliftFractionOfRdl, input.gym, "down");
        why = `First deadlift sessions: ${Math.round(input.rules.baseline.deadliftFractionOfRdl * 100)}% of your 8-rep RDL (${fmtKg(eightRep)} kg). Technique before load.`;
        change = { from: null, to: weight, rule: "B3", reason: why, date: rdl.date };
      } else {
        status = "choose_load";
        why = "No RDL baseline yet. Start with the bar and light plates; dead stop every rep.";
      }
    } else if (group && !input.baselines[group]) {
      status = "baseline_test";
      repTargets = Array(Math.max(3, n)).fill(input.rules.baseline.testReps);
      why = "Baseline test: build up in sets of 8. Stop at the weight where 8 reps leave about 2 in reserve. Log every set.";
      hint = lastRampInHint(input.sets, ex.key, input.date);
    } else if (!st || st.status === "unset") {
      status = mode === "none" ? "reps_only" : "choose_load";
      why = mode === "none"
        ? `Aim for ${lo}–${hi} reps with ${def.rir} in reserve.`
        : `Pick a load you can lift for ${lo}–${hi} reps with ${def.rir} in reserve. This session sets the starting point.`;
      hint = lastRampInHint(input.sets, ex.key, input.date);
    } else {
      status = mode === "none" ? "reps_only" : "working";
      weight = mode === "none" ? null : st.weight;
      repTargets = fit(st.repTargets, n, lo);
      const last = latestAny.get(def.track);
      why = last ? last.reason : `Target ${lo}–${hi} reps.`;
      if (last && isChange(last)) {
        change = { from: last.from?.weight ?? null, to: last.to.weight, rule: last.rule, reason: last.reason, date: last.date };
      }
    }

    // A1: never a single before December.
    if (input.date < ONE_RM_ALLOWED_FROM && repTargets.some((r) => r <= 1)) {
      throw new RuleAssertionError("A1", `${def.track} prescribes a single on ${input.date}.`);
    }

    let plates: CardSlot["plates"] = null;
    if (ex.equipment === "barbell" && weight !== null) {
      const prev = st?.lastSets.find((s) => s.weight !== null)?.weight ?? null;
      plates = plateDiff(prev, weight, input.gym)?.plates ?? null;
    }

    const bestSetAllowed =
      input.gate.open &&
      (status === "working" || status === "reps_only") &&
      !withinDeloadWindow(st?.lastDeload ?? null, input.date, input.rules);

    let substitute: CardSubstitute | null = null;
    if (ex.substitute) {
      const subTrack = substituteTrack(ex.substitute, def.track);
      const subState = input.states[subTrack];
      substitute = {
        exercise: cardExercise(ex.substitute),
        track: subTrack,
        step: stepFor(ex.substitute, input.gym),
        weight: subState?.status === "active" ? subState.weight : null,
        repTargets: subState?.status === "active" ? fit(subState.repTargets, n, lo) : Array(n).fill(lo),
      };
    }

    slots.push({
      slot: def.slot,
      label: def.label ?? ex.name,
      exercise: cardExercise(ex.key),
      track: def.track,
      status,
      sets: status === "baseline_test" ? repTargets.length : n,
      reps: def.reps,
      repTargets,
      rir: def.rir,
      rest: def.rest,
      restSeconds: restSeconds(def.rest),
      weight,
      step,
      plates,
      change,
      why,
      bestSetAllowed,
      substitute,
      optional: !!def.optional,
      supersetWith: def.supersetWith ?? null,
      note: def.note ?? null,
      hint,
    });
  }

  return {
    ...base,
    kind: "train",
    restReason: null,
    session: {
      key: session.key,
      name: session.name,
      focus: session.focus,
      minutes: session.minutes,
      cardio: session.cardio ?? null,
    },
    optionalDay: plan.optionalDay,
    slots,
    totalSets: slots.filter((s) => !s.optional).reduce((a, s) => a + s.sets, 0),
    notes,
  };
}

/** The lift to headline on the home screen: the first slot with a load. */
export function headlineSlot(card: Card): CardSlot | null {
  return card.slots.find((s) => s.weight !== null && s.status !== "percent") ?? card.slots[0] ?? null;
}

export function repRangeText(reps: [number, number]): string {
  return reps[0] === reps[1] ? `${reps[0]}` : `${reps[0]}–${reps[1]}`;
}

export function loadText(slot: Pick<CardSlot, "weight" | "exercise" | "status">): string {
  if (slot.status === "baseline_test") return "Find your 8";
  if (slot.exercise.loadMode === "none") return "Bodyweight";
  if (slot.weight === null) return "Your pick";
  if (slot.exercise.loadMode === "added") return slot.weight === 0 ? "Bodyweight" : `BW + ${fmtKg(slot.weight)} kg`;
  return `${fmtKg(slot.weight)} kg`;
}
