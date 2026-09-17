import { beforeEach, describe, expect, it } from "vitest";
import { bestEventText, computeBests } from "@/lib/fitness/bests";
import { makeBodyweightLookup } from "@/lib/fitness/progression";
import { readinessGate, sleepMinutes, withinDeloadWindow } from "@/lib/fitness/readiness";
import { RULES_V1 } from "@/lib/fitness/rules";
import { loggingStreak } from "@/lib/fitness/streak";
import { resetIds, sets, weighIn } from "../support/fixtures";

const rules = RULES_V1;
beforeEach(() => resetIds());

describe("readiness gate (R1–R3)", () => {
  const base = { phase: "full" as const, kcalTarget: 2650, rules };

  it("opens with 7 h sleep and 90% of calories", () => {
    const g = readinessGate({ ...base, sleepMinutes: 450, yesterdayKcal: 2650 });
    expect(g).toMatchObject({ status: "open", open: true, sleepOk: true, kcalOk: true });
    expect(g.reasons.join(" ")).toContain("7 h 30 m");
  });

  it("stays closed on short sleep or low calories, and says which", () => {
    const sleep = readinessGate({ ...base, sleepMinutes: 380, yesterdayKcal: 2650 });
    expect(sleep).toMatchObject({ status: "closed", open: false, sleepOk: false, kcalOk: true });
    const food = readinessGate({ ...base, sleepMinutes: 480, yesterdayKcal: 2300 });
    expect(food).toMatchObject({ status: "closed", kcalOk: false });
    expect(food.reasons.join(" ")).toContain("87%");
    expect(readinessGate({ ...base, sleepMinutes: 420, yesterdayKcal: 2385 }).open).toBe(true);
  });

  it("never guesses missing inputs (M1)", () => {
    const g = readinessGate({ ...base, sleepMinutes: null, yesterdayKcal: 2700 });
    expect(g).toMatchObject({ status: "missing", open: false });
    expect(g.reasons[0]).toContain("last night's sleep");
    expect(readinessGate({ ...base, sleepMinutes: 450, yesterdayKcal: null }).reasons[0]).toContain("yesterday's calories");
  });

  it("does not apply during the ramp-in or the baseline week (R3)", () => {
    expect(readinessGate({ ...base, phase: "rampin", sleepMinutes: 500, yesterdayKcal: 2700 }).status).toBe("not_applicable");
    expect(readinessGate({ ...base, phase: "baseline", sleepMinutes: 500, yesterdayKcal: 2700 }).open).toBe(false);
  });

  it("computes sleep from bed and wake times", () => {
    expect(sleepMinutes("2026-10-04T18:00:00.000Z", "2026-10-05T01:30:00.000Z")).toBe(450);
    expect(sleepMinutes(null, "2026-10-05T01:30:00.000Z")).toBeNull();
    expect(sleepMinutes("2026-10-05T01:30:00.000Z", "2026-10-04T18:00:00.000Z")).toBeNull();
  });

  it("keeps best-set attempts off for 14 days after a deload (R2)", () => {
    expect(withinDeloadWindow("2026-10-15", "2026-10-29", rules)).toBe(true);
    expect(withinDeloadWindow("2026-10-15", "2026-10-30", rules)).toBe(false);
    expect(withinDeloadWindow(null, "2026-10-30", rules)).toBe(false);
  });
});

describe("bests", () => {
  const bw = makeBodyweightLookup([weighIn("2026-09-21", 60)]);

  it("only counts sets of 6–12 reps and ignores ramp-in and warm-ups", () => {
    const b = computeBests(
      [
        ...sets("2026-09-14", "bench_volume", 60, [8]),
        ...sets("2026-09-24", "bench_heavy", 55, [5]),
        ...sets("2026-09-24", "bench_volume", 30, [15]),
        ...sets("2026-09-25", "bench_volume", 50, [8], { warmup: true }),
        ...sets("2026-09-26", "bench_volume", 45, [10]),
      ],
      bw,
      rules,
    );
    expect(b.bench.best).toMatchObject({ weight: 45, reps: 10, e1rm: 60 });
    expect(Object.keys(b.bench.byReps)).toEqual(["10"]);
  });

  it("calls comeback bests regain until the December peak is passed", () => {
    const b = computeBests(
      [
        ...sets("2026-10-01", "bench_volume", 45, [10]),
        ...sets("2026-10-08", "bench_volume", 50, [10]),
        ...sets("2026-10-15", "bench_volume", 55, [10]),
        ...sets("2026-10-22", "bench_volume", 57.5, [10]),
      ],
      bw,
      rules,
    );
    expect(b.bench.events.map((e) => [e.kind, e.measure])).toEqual([
      ["regain", "e1rm"],
      ["peak", "e1rm"],
      ["pr", "e1rm"],
    ]);
    expect(b.bench.peakPassed).toBe(true);
    expect(b.bench.regainPct).toBe(100);
    expect(bestEventText(b.bench.events[1])).toContain("PRs start now");
  });

  it("reports regain progress as a share of the peak", () => {
    const b = computeBests(sets("2026-10-01", "bench_volume", 45, [10]), bw, rules);
    expect(b.bench.regainPct).toBe(82);
    expect(b.bench.peakPassed).toBe(false);
  });

  it("uses total load for pull-ups and plain bests for lifts without a peak", () => {
    const b = computeBests(
      [
        ...sets("2026-10-09", "pullup_bw", 5, [8]),
        ...sets("2026-10-16", "pullup_bw", 7.5, [8]),
        ...sets("2026-10-07", "back_squat", 60, [8]),
        ...sets("2026-10-14", "back_squat", 65, [8]),
      ],
      bw,
      rules,
    );
    expect(b.pullup.best).toMatchObject({ load: 67.5 });
    expect(b.pullup.events[0].kind).toBe("regain");
    expect(b.squat.events[0].kind).toBe("best");
    expect(bestEventText(b.pullup.events[0])).toContain("+7.5 kg × 8");
  });

  it("records a rep best when the same reps move more load", () => {
    const b = computeBests(
      [...sets("2026-10-07", "back_squat", 60, [8, 6]), ...sets("2026-10-14", "back_squat", 70, [6])],
      bw,
      rules,
    );
    expect(b.squat.byReps[6].weight).toBe(70);
    expect(b.squat.events.map((e) => e.measure)).toEqual(["e1rm"]);
  });

  it("respects the cut-off date", () => {
    const b = computeBests(sets("2026-10-07", "back_squat", 60, [8]), bw, rules, "2026-10-07");
    expect(b.squat).toBeUndefined();
  });
});

describe("logging streak", () => {
  const days = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `2026-10-${String(from + i).padStart(2, "0")}`);

  it("counts days with both the weigh-in and the evening totals", () => {
    const s = loggingStreak({ today: "2026-10-10", weighInDates: days(1, 10), nutritionDates: days(1, 9) });
    expect(s).toEqual({ current: 9, best: 9, todayDone: false });
  });

  it("includes today once it's complete", () => {
    expect(loggingStreak({ today: "2026-10-10", weighInDates: days(1, 10), nutritionDates: days(1, 10) })).toEqual({
      current: 10,
      best: 10,
      todayDone: true,
    });
  });

  it("breaks on a gap and remembers the best run", () => {
    const w = [...days(1, 5), ...days(7, 10)];
    const s = loggingStreak({ today: "2026-10-11", weighInDates: w, nutritionDates: days(1, 10) });
    expect(s).toEqual({ current: 4, best: 5, todayDone: false });
    expect(loggingStreak({ today: "2026-10-20", weighInDates: w, nutritionDates: days(1, 10) }).current).toBe(0);
  });
});
