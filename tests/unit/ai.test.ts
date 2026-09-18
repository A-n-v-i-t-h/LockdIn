import { describe, expect, it } from "vitest";
import { ActSchema, classifyChange, describeChange, type ClassifyContext } from "@/lib/ai/coach";
import { DEFAULT_GYM } from "@/lib/fitness/equipment";
import type { TrackState } from "@/lib/fitness/progression";

const state = (track: string, exercise: string, weight: number | null): TrackState => ({
  track,
  exercise,
  status: weight === null ? "unset" : "active",
  weight,
  repTargets: [6, 6, 6],
  successes: 0,
  misses: 0,
  lastDeload: null,
  lastLoadChange: null,
  lastSession: null,
  lastSets: [],
  seed: null,
});

const gym2_5 = { ...DEFAULT_GYM, plates: [25, 20, 15, 10, 5, 2.5] }; // smallest barbell jump 5 kg
const ctx: ClassifyContext = {
  today: "2026-10-14",
  states: { bench_heavy: state("bench_heavy", "bench_press", 50), back_squat: state("back_squat", "back_squat", null) },
  gym: gym2_5,
  kcalWeekAgo: 2650,
};

describe("AI coach limits", () => {
  it("applies one loadable step up at once, and asks for more", () => {
    expect(classifyChange({ type: "load", track: "bench_heavy", weight: 55, reason: "Hit the top of the range twice" }, ctx)).toEqual({ kind: "apply" });
    const big = classifyChange({ type: "load", track: "bench_heavy", weight: 60, reason: "x" }, ctx);
    expect(big).toMatchObject({ kind: "review" });
  });

  it("applies a normal deload, asks for a deep cut", () => {
    expect(classifyChange({ type: "load", track: "bench_heavy", weight: 45, reason: "Deload" }, ctx).kind).toBe("apply");
    expect(classifyChange({ type: "load", track: "bench_heavy", weight: 40, reason: "x" }, ctx).kind).toBe("review");
  });

  it("asks before setting the first load on a lift with no working weight", () => {
    expect(classifyChange({ type: "load", track: "back_squat", weight: 60, reason: "x" }, ctx)).toMatchObject({ kind: "review", why: "This lift has no working weight yet." });
  });

  it("rejects unknown lifts and macros that don't add up", () => {
    expect(classifyChange({ type: "load", track: "nope", weight: 10, reason: "x" }, ctx).kind).toBe("reject");
    expect(classifyChange({ type: "targets", kcal: 2750, protein: 120, carbs: 385, fat: 70, reason: "x" }, ctx).kind).toBe("reject");
  });

  it("paces calories: up to 250 kcal a week at once, more needs a yes, protein floor holds", () => {
    expect(classifyChange({ type: "targets", kcal: 2750, protein: 120, carbs: 410, fat: 70, reason: "Flat" }, ctx).kind).toBe("apply");
    expect(classifyChange({ type: "targets", kcal: 3050, protein: 130, carbs: 470, fat: 76, reason: "x" }, ctx).kind).toBe("review");
    expect(classifyChange({ type: "targets", kcal: 2650, protein: 100, carbs: 405, fat: 70, reason: "x" }, ctx).kind).toBe("review");
  });

  it("moves apply, skips and suggestions wait for him", () => {
    expect(classifyChange({ type: "move", date: "2026-10-14", toDate: "2026-10-18", reason: "x" }, ctx).kind).toBe("apply");
    expect(classifyChange({ type: "skip", date: "2026-10-14", reason: "x" }, ctx).kind).toBe("review");
    expect(classifyChange({ type: "suggest", text: "Sleep before 11" }, ctx).kind).toBe("review");
  });

  it("validates the reply shape", () => {
    expect(ActSchema.safeParse({ date: "2026-10-14", kind: "daily", note: "ok" }).success).toBe(true);
    expect(ActSchema.safeParse({ date: "14/10", kind: "daily", note: "ok" }).success).toBe(false);
    expect(ActSchema.safeParse({ date: "2026-10-14", kind: "daily", note: "ok", changes: [{ type: "oneRepMax" }] }).success).toBe(false);
    const nine = Array(9).fill({ type: "suggest", text: "x" });
    expect(ActSchema.safeParse({ date: "2026-10-14", kind: "daily", note: "ok", changes: nine }).success).toBe(false);
    expect(describeChange({ type: "load", track: "bench_heavy", weight: 55, reason: "x" })).toBe("Barbell Bench Press: 55 kg");
  });
});
