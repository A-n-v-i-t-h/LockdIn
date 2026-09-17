import type { WeighIn } from "./nutrition";
import { addDays, localTime, toInstant } from "@/lib/time";

/** A bed time later than the wake time means the night before. */
export function sleepInstants(date: string, bed: string, wake: string): { bedAt: string; wakeAt: string } {
  const bedDate = bed > wake ? addDays(date, -1) : date;
  return { bedAt: toInstant(bedDate, bed).toISOString(), wakeAt: toInstant(date, wake).toISOString() };
}

/** Prefill sleep times from the most recent check-in that has them. */
export function usualSleepTimes(weighIns: WeighIn[], before: string): { bed: string; wake: string; fromHistory: boolean } {
  const last = [...weighIns]
    .filter((w) => w.date < before && w.bedAt && w.wakeAt)
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  if (!last) return { bed: "23:30", wake: "07:00", fromHistory: false };
  return { bed: localTime(new Date(last.bedAt!)), wake: localTime(new Date(last.wakeAt!)), fromHistory: true };
}
