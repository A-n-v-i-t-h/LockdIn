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

/**
 * A holiday or a missed day. `move` puts the session planned on `date` onto `toDate`
 * (same Monday–Sunday week); if `toDate` already has a session the two swap.
 * `skip` makes `date` a rest day and its lifts repeat unchanged next time.
 */
export type DayChange =
  | { id: string; kind: "move"; date: string; toDate: string; recordedAt: string }
  | { id: string; kind: "skip"; date: string; recordedAt: string };

export interface ScheduleSettings {
  /** Weekday (1–6) left out in weeks 3–4, when the plan runs 5 days. */
  buildRestDay: number;
  /** Absent when there are none, so the inputs digest of older runs stays the same. */
  changes?: DayChange[];
}

export const DEFAULT_SCHEDULE: ScheduleSettings = { buildRestDay: 5 };

export type RestReason = "sunday" | "build-rest" | "pre" | "moved" | "skipped";

export type DayPlan =
  | { kind: "rest"; date: string; week: number; phase: Phase; reason: RestReason; movedTo?: string }
  | { kind: "train"; date: string; week: number; phase: Phase; session: SessionDef; optionalDay: boolean; movedFrom?: string };

/** Monday of the week holding `date`. */
export function weekStart(date: string): string {
  return addDays(date, 1 - weekday(date));
}

export function dayPlan(date: string, settings: ScheduleSettings = DEFAULT_SCHEDULE): DayPlan {
  const changes = settings.changes?.filter((c) => weekStart(c.date) === weekStart(date));
  if (!changes?.length) return basePlan(date, settings);
  return weekPlans(date, settings, changes).find((p) => p.date === date)!;
}

/** The seven days (Monday first) of the week holding `date`, with its moves and skips applied. */
export function weekPlan(date: string, settings: ScheduleSettings = DEFAULT_SCHEDULE): DayPlan[] {
  const monday = weekStart(date);
  const changes = (settings.changes ?? []).filter((c) => weekStart(c.date) === monday);
  return weekPlans(date, settings, changes);
}

function weekPlans(date: string, settings: ScheduleSettings, changes: DayChange[]): DayPlan[] {
  const monday = weekStart(date);
  const bases = Array.from({ length: 7 }, (_, i) => basePlan(addDays(monday, i), settings));
  const days = [...bases];
  const at = (d: string) => diffDays(d, monday);
  const ordered = [...changes].sort((a, b) => (a.recordedAt < b.recordedAt ? -1 : a.recordedAt > b.recordedAt ? 1 : a.id < b.id ? -1 : 1));
  for (const c of ordered) {
    const from = days[at(c.date)];
    if (!from || from.kind !== "train") continue; // nothing to move or skip (stale change)
    if (c.kind === "skip") {
      days[at(c.date)] = { kind: "rest", date: from.date, week: from.week, phase: from.phase, reason: "skipped" };
      continue;
    }
    const i = at(c.toDate);
    const to = days[i];
    if (!to || i === at(c.date) || to.phase === "pre") continue;
    days[i] = { ...from, date: to.date, week: to.week, phase: to.phase, optionalDay: to.phase === "rampin", movedFrom: from.movedFrom ?? from.date };
    days[at(c.date)] =
      to.kind === "train"
        ? { ...to, date: from.date, week: from.week, phase: from.phase, optionalDay: from.phase === "rampin", movedFrom: to.movedFrom ?? to.date }
        : bases[at(c.date)].kind === "rest"
          ? bases[at(c.date)] // a session that had been moved onto a rest day leaves it
          : { kind: "rest", date: from.date, week: from.week, phase: from.phase, reason: "moved", movedTo: to.date };
  }
  for (const d of days) {
    if (d.kind === "train" && d.movedFrom === d.date) delete d.movedFrom; // moved back home
  }
  return days;
}

function basePlan(date: string, settings: ScheduleSettings): DayPlan {
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
