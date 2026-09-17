import { addDays, diffDays, weekday } from "@/lib/time";
import {
  BASELINE_WEEK_START,
  FULL_PROGRAM_START,
  PROGRAM_START,
  SESSIONS,
  type SessionDef,
  type SlotDef,
} from "./program";

export type Phase = "pre" | "rampin" | "baseline" | "build" | "full";

/** Week 1 starts Monday 2026-09-07. Dates before it are week 0. */
export function weekNumber(date: string): number {
  const d = diffDays(date, PROGRAM_START);
  return d < 0 ? 0 : Math.floor(d / 7) + 1;
}

export function phaseOf(date: string): Phase {
  const w = weekNumber(date);
  if (w === 0) return "pre";
  if (w <= 2) return "rampin";
  if (w === 3) return "baseline";
  if (w === 4) return "build";
  return "full";
}

/** Entries before the week-3 baselines are ramp-in: kept in history, ignored by progression. */
export function isRampIn(date: string): boolean {
  return date < BASELINE_WEEK_START;
}

export function isBaselineWeek(date: string): boolean {
  return phaseOf(date) === "baseline";
}

export const PHASE_LABEL: Record<Phase, string> = {
  pre: "Before the program",
  rampin: "Ramp-in (trainer block)",
  baseline: "Baseline week",
  build: "Build week",
  full: "Full program",
};

export interface ScheduleSettings {
  /** Weekday (1–6) left out in weeks 3–4, when the plan runs 5 days. */
  buildRestDay: number;
}

export const DEFAULT_SCHEDULE: ScheduleSettings = { buildRestDay: 5 };

export type DayPlan =
  | { kind: "rest"; date: string; week: number; phase: Phase; reason: "sunday" | "build-rest" | "pre" }
  | { kind: "train"; date: string; week: number; phase: Phase; session: SessionDef; optionalDay: boolean };

export function dayPlan(date: string, settings: ScheduleSettings = DEFAULT_SCHEDULE): DayPlan {
  const week = weekNumber(date);
  const phase = phaseOf(date);
  const wd = weekday(date);
  if (phase === "pre") return { kind: "rest", date, week, phase, reason: "pre" };
  if (wd === 7) return { kind: "rest", date, week, phase, reason: "sunday" };
  if ((phase === "baseline" || phase === "build") && wd === settings.buildRestDay) {
    return { kind: "rest", date, week, phase, reason: "build-rest" };
  }
  const session = SESSIONS.find((s) => s.weekday === wd);
  if (!session) return { kind: "rest", date, week, phase, reason: "sunday" };
  // Weeks 1–2 run 3–4 days with the trainer, so any given day is optional.
  return { kind: "train", date, week, phase, session, optionalDay: phase === "rampin" };
}

/** Is this slot part of the session on this date, and with how many sets? */
export function slotSets(slot: SlotDef, date: string): number | null {
  if (slot.from && date < slot.from) return null;
  if (isRampIn(date)) return 2;
  if (slot.setsBefore && date < slot.setsBefore.date) return slot.setsBefore.sets;
  return slot.sets;
}

/** Next date (after `after`) on which a track is scheduled. */
export function nextDateForTrack(
  track: string,
  after: string,
  settings: ScheduleSettings = DEFAULT_SCHEDULE,
  horizonDays = 21,
): string | null {
  for (let i = 1; i <= horizonDays; i++) {
    const d = addDays(after, i);
    const plan = dayPlan(d, settings);
    if (plan.kind !== "train") continue;
    if (plan.session.slots.some((s) => s.track === track && slotSets(s, d) !== null)) return d;
  }
  return null;
}

export const SCHEDULE_FACTS = {
  programStart: PROGRAM_START,
  baselineWeekStart: BASELINE_WEEK_START,
  fullProgramStart: FULL_PROGRAM_START,
};
