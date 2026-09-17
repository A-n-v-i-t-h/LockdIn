import type { LoggedSet, OverrideEvent } from "@/lib/fitness/progression";
import type { Measurement, NutritionDay, Targets, WeighIn } from "@/lib/fitness/nutrition";
import { TRACKS } from "@/lib/fitness/program";
import { addDays } from "@/lib/time";

let counter = 0;
const id = (p: string) => `${p}-${String(++counter).padStart(6, "0")}`;

export function resetIds() {
  counter = 0;
}

/** Recorded the evening of the set's date, in order. */
export function recordedAt(date: string, seq = 0): string {
  return new Date(Date.parse(`${date}T14:00:00.000Z`) + seq * 1000).toISOString();
}

/** Sets for one track on one date. Weight may be a number for all sets or one per set. */
export function sets(
  date: string,
  track: string,
  weight: number | null | (number | null)[],
  reps: number[],
  opts: { exercise?: string; slot?: string; warmup?: boolean } = {},
): LoggedSet[] {
  const slotDef = TRACKS[track]?.slot;
  const exercise = opts.exercise ?? slotDef?.exercise;
  if (!exercise) throw new Error(`No exercise for track ${track}`);
  const sessionId = `session-${date}`;
  return reps.map((r, i) => ({
    id: id("set"),
    date,
    sessionId,
    slot: opts.slot ?? slotDef?.slot ?? "1",
    exercise,
    track,
    setIndex: i + 1,
    weight: Array.isArray(weight) ? weight[i] : weight,
    reps: r,
    isWarmup: !!opts.warmup,
    recordedAt: recordedAt(date, counter),
  }));
}

export function override(date: string, track: string, field: "weight" | "reps", value: unknown, reason = ""): OverrideEvent {
  return {
    id: id("ov"),
    date,
    recordedAt: `${date}T02:00:00.000Z`,
    target: `track:${track}`,
    field,
    value,
    reason,
  };
}

export function weighIn(date: string, weight: number | null, opts: { protocolOk?: boolean; bed?: string; wake?: string } = {}): WeighIn {
  return {
    id: id("w"),
    date,
    weight,
    protocolOk: opts.protocolOk ?? true,
    bedAt: opts.bed === undefined ? `${addDays(date, -1)}T18:00:00.000Z` : opts.bed, // 23:30 IST
    wakeAt: opts.wake === undefined ? `${date}T01:30:00.000Z` : opts.wake, // 07:00 IST → 7 h 30 m
    recordedAt: `${date}T02:00:00.000Z`,
  };
}

/** Daily weigh-ins following a linear trend (kg/day) from a start weight. */
export function weightSeries(from: string, to: string, start: number, perDay: number, skip: string[] = []): WeighIn[] {
  const out: WeighIn[] = [];
  let i = 0;
  for (let d = from; d <= to; d = addDays(d, 1), i++) {
    if (skip.includes(d)) continue;
    out.push(weighIn(d, Math.round((start + perDay * i) * 100) / 100));
  }
  return out;
}

export function nutrition(date: string, kcal: number, protein = 120, carbs = 385, fat = 70, note = ""): NutritionDay {
  return { id: id("n"), date, kcal, protein, carbs, fat, note, recordedAt: `${date}T16:30:00.000Z` };
}

export function waist(date: string, cm: number): Measurement {
  return { id: id("m"), date, kind: "waist", valueCm: cm, recordedAt: `${date}T02:05:00.000Z` };
}

export function target(effectiveDate: string, kcal: number, carbs: number, source: Targets["source"] = "coach"): Targets {
  return {
    id: id("t"),
    effectiveDate,
    kcal,
    protein: 120,
    carbs,
    fat: 70,
    source,
    reason: "test",
    recordedAt: `${effectiveDate}T02:10:00.000Z`,
  };
}
