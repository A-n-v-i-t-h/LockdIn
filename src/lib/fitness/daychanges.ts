// The checks a move or skip must pass, shared by his Week page and the AI coach.
import type { Queryable } from "@/lib/db";
import { diffDays, fmtShort, isIsoDate } from "@/lib/time";
import { getSession, loadSettings, sessionSets } from "./repo";
import { dayPlan, weekStart } from "./schedule";

export type DayChangeInput = { kind: "move"; date: string; toDate: string } | { kind: "skip"; date: string };

/** Days that can be changed: the last 30 (to fix a missed day) and the next 14 (a known holiday). */
export function checkChangeDate(date: string, today: string): string | null {
  if (!isIsoDate(date)) return "Pick a valid date.";
  if (diffDays(today, date) > 30) return "Only the last 30 days can be changed.";
  if (diffDays(date, today) > 14) return "Only the next two weeks can be planned.";
  return null;
}

export async function hasLoggedSets(q: Queryable, userId: string, date: string): Promise<boolean> {
  const session = await getSession(q, userId, date);
  return !!session && (await sessionSets(q, userId, session.id)).length > 0;
}

/** Why this change can't be made, or null when it can. */
export async function checkDayChange(q: Queryable, userId: string, c: DayChangeInput, today: string): Promise<string | null> {
  const bad = checkChangeDate(c.date, today) ?? (c.kind === "move" ? checkChangeDate(c.toDate, today) : null);
  if (bad) return bad;
  const { schedule } = await loadSettings(q, userId);
  if (c.kind === "move") {
    if (c.date === c.toDate) return "Pick a different day to move it to.";
    if (weekStart(c.date) !== weekStart(c.toDate)) return "Sessions move within their own week (Monday to Sunday).";
    if (dayPlan(c.date, schedule).kind !== "train") return `${fmtShort(c.date)} has no session to move.`;
    if (dayPlan(c.toDate, schedule).phase === "pre") return "That day is before the program starts.";
  } else if (dayPlan(c.date, schedule).kind !== "train") {
    return `${fmtShort(c.date)} has no session to skip.`;
  }
  for (const d of c.kind === "move" ? [c.date, c.toDate] : [c.date]) {
    if (await hasLoggedSets(q, userId, d)) return `${fmtShort(d)} already has logged sets, so it stays as it is.`;
  }
  return null;
}
