import { addDays } from "@/lib/time";

/**
 * Logging streak from real history: a day counts when both the morning weigh-in
 * and the evening Cronometer totals exist. Today counts once it is complete;
 * until then the streak runs to yesterday and isn't broken.
 */
export function loggingStreak(input: {
  today: string;
  weighInDates: Iterable<string>;
  nutritionDates: Iterable<string>;
}): { current: number; best: number; todayDone: boolean } {
  const w = new Set(input.weighInDates);
  const n = new Set(input.nutritionDates);
  const complete = (d: string) => w.has(d) && n.has(d);
  const todayDone = complete(input.today);

  let current = 0;
  let d = todayDone ? input.today : addDays(input.today, -1);
  while (complete(d)) {
    current++;
    d = addDays(d, -1);
  }

  const days = [...w].filter((x) => n.has(x) && x <= input.today).sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const x of days) {
    run = prev !== null && addDays(prev, 1) === x ? run + 1 : 1;
    best = Math.max(best, run);
    prev = x;
  }
  return { current, best: Math.max(best, current), todayDone };
}
