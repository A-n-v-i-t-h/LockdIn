import { beforeEach, describe, expect, it } from "vitest";
import {
  applyChange,
  averageNutrition,
  dailyFeedback,
  mealLineNotes,
  monthlyAudit,
  rateBand,
  rollingSeries,
  sevenDayAverage,
  targetOn,
  weeklyReview,
} from "@/lib/fitness/nutrition";
import { matchFoods } from "@/lib/fitness/foods";
import { RULES_V1 } from "@/lib/fitness/rules";
import { nutrition, resetIds, target, waist, weighIn, weightSeries } from "../support/fixtures";

const rules = RULES_V1;
beforeEach(() => resetIds());

describe("averages", () => {
  it("averages only protocol weigh-ins over the last 7 days", () => {
    const w = [
      weighIn("2026-10-01", 60),
      weighIn("2026-10-02", 61),
      weighIn("2026-10-03", 70, { protocolOk: false }),
      weighIn("2026-10-04", null),
      weighIn("2026-09-20", 50),
    ];
    expect(sevenDayAverage(w, "2026-10-04")).toEqual({ avg: 60.5, n: 2 });
    expect(sevenDayAverage(w, "2026-09-26")).toEqual({ avg: 50, n: 1 });
    expect(sevenDayAverage([], "2026-10-04")).toEqual({ avg: null, n: 0 });
  });

  it("builds a rolling series with gaps shown as missing", () => {
    const s = rollingSeries([weighIn("2026-10-01", 60), weighIn("2026-10-03", 61)], "2026-10-01", "2026-10-03");
    expect(s.map((p) => [p.daily, p.avg])).toEqual([
      [60, 60],
      [null, 60],
      [61, 60.5],
    ]);
  });

  it("computes the Phase 1 and Phase 2 rate bands", () => {
    expect(rateBand(60, false, rules)).toMatchObject({ low: 0.24, high: 0.3 });
    expect(rateBand(66, true, rules)).toMatchObject({ low: 0.17, high: 0.2 });
  });
});

describe("targets", () => {
  it("starts from the plan and follows later changes", () => {
    expect(targetOn([], "2026-10-01")).toMatchObject({ kcal: 2650, protein: 120, carbs: 385, fat: 70, source: "plan" });
    const t = [target("2026-10-12", 2750, 410), target("2026-11-02", 2600, 372.5)];
    expect(targetOn(t, "2026-10-11").kcal).toBe(2650);
    expect(targetOn(t, "2026-10-12").kcal).toBe(2750);
    expect(targetOn(t, "2026-11-30").carbs).toBe(372.5);
  });

  it("changes carbs only; protein and fat stay frozen", () => {
    const next = applyChange(targetOn([], "2026-10-12"), { carbsDelta: 25, kcalDelta: 100, rule: "N1", reason: "" });
    expect(next).toEqual({ kcal: 2750, protein: 120, carbs: 410, fat: 70 });
    const cut = applyChange(targetOn([], "2026-10-12"), { carbsDelta: -37.5, kcalDelta: -150, rule: "N2", reason: "" });
    expect(cut).toEqual({ kcal: 2500, protein: 120, carbs: 347.5, fat: 70 });
  });
});

describe("weekly review", () => {
  const flat = weightSeries("2026-09-21", "2026-10-11", 59.5, 0.002);
  const rising = weightSeries("2026-09-21", "2026-10-11", 59.5, 0.04);

  it("waits for three full weeks after the ramp-in", () => {
    const r = weeklyReview({ date: "2026-10-05", weighIns: flat, measurements: [waist("2026-10-05", 75)], targets: [], phase2: false, rules });
    expect(r.status).toBe("not_started");
    expect(r.change).toBeNull();
  });

  it("adds 25 g carbs when the average is flat for two weeks (N1)", () => {
    const r = weeklyReview({ date: "2026-10-12", weighIns: flat, measurements: [waist("2026-10-12", 75)], targets: [], phase2: false, rules });
    expect(r.status).toBe("change");
    expect(r.change).toMatchObject({ carbsDelta: 25, kcalDelta: 100, rule: "N1" });
    expect(r.weeks.map((w) => w.start)).toEqual(["2026-10-05", "2026-09-28", "2026-09-21"]);
    expect(r.twoWeekGain).toBeLessThan(0.15);
  });

  it("holds when the average is rising and reports the band", () => {
    const r = weeklyReview({ date: "2026-10-12", weighIns: rising, measurements: [waist("2026-10-12", 75)], targets: [], phase2: false, rules });
    expect(r.status).toBe("hold");
    expect(r.change).toBeNull();
    expect(r.weeklyGain).toBeCloseTo(0.28, 2);
    expect(r.summary).toContain("inside");
  });

  it("can't run without this week's waist (N6)", () => {
    const r = weeklyReview({ date: "2026-10-12", weighIns: flat, measurements: [waist("2026-10-05", 75)], targets: [], phase2: false, rules });
    expect(r.status).toBe("blocked");
    expect(r.change).toBeNull();
  });

  it("needs four readings in each week (M1)", () => {
    const sparse = flat.filter((w) => !["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01"].includes(w.date));
    const r = weeklyReview({ date: "2026-10-12", weighIns: sparse, measurements: [waist("2026-10-12", 75)], targets: [], phase2: false, rules });
    expect(r.status).toBe("insufficient");
    expect(r.summary).toContain("has 3");
  });

  it("waits 14 days between calorie changes", () => {
    const r = weeklyReview({
      date: "2026-10-19",
      weighIns: weightSeries("2026-09-21", "2026-10-18", 59.5, 0.002),
      measurements: [waist("2026-10-19", 75)],
      targets: [target("2026-10-12", 2750, 410)],
      phase2: false,
      rules,
    });
    expect(r.status).toBe("cooldown");
    const later = weeklyReview({
      date: "2026-10-26",
      weighIns: weightSeries("2026-09-21", "2026-10-25", 59.5, 0.002),
      measurements: [waist("2026-10-26", 75)],
      targets: [target("2026-10-12", 2750, 410)],
      phase2: false,
      rules,
    });
    expect(later.status).toBe("change");
  });

  it("ignores a manual target from the plan source for the cooldown", () => {
    const r = weeklyReview({
      date: "2026-10-12",
      weighIns: flat,
      measurements: [waist("2026-10-12", 75)],
      targets: [target("2026-09-07", 2650, 385, "plan")],
      phase2: false,
      rules,
    });
    expect(r.status).toBe("change");
  });
});

describe("monthly audit", () => {
  const lifts = { up: true, flat: false, detail: "" };
  const series = (perDay: number) => weightSeries("2026-09-21", "2026-11-01", 59.5, perDay);

  it("does not run before four weeks of post-ramp-in data", () => {
    const r = monthlyAudit({ date: "2026-10-05", weighIns: series(0.04), measurements: [], targets: [], lifts, rules });
    expect(r.status).toBe("not_started");
  });

  it("cuts 150 kcal when the waist grows over 1 cm while weight climbs (N2)", () => {
    const r = monthlyAudit({
      date: "2026-11-02",
      weighIns: series(0.04),
      measurements: [waist("2026-10-05", 75), waist("2026-11-02", 76.5)],
      targets: [],
      lifts,
      rules,
    });
    expect(r.status).toBe("change");
    expect(r.change).toMatchObject({ kcalDelta: -150, carbsDelta: -37.5, rule: "N2" });
    expect(r.waistDelta).toBe(1.5);
  });

  it("uses the waist-to-weight ratio as a second guardrail (N3)", () => {
    const fast = monthlyAudit({
      date: "2026-11-02",
      weighIns: series(0.04),
      measurements: [waist("2026-10-05", 75), waist("2026-11-02", 76)],
      targets: [],
      lifts,
      rules,
    });
    expect(fast.monthlyGain).toBeCloseTo(1.12, 2);
    expect(fast.ratio).toBeCloseTo(0.89, 2);
    expect(fast.status).toBe("hold");
    expect(fast.outcomes.map((o) => o.rule)).toContain("N3");

    // Exactly 1 kg gained and 1 cm of waist: 1:1 is too fast even without the >1 cm row.
    const flatWeeks = [
      ...["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01"].map((d) => weighIn(d, 60)),
      ...["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29"].map((d) => weighIn(d, 61)),
    ];
    const oneToOne = monthlyAudit({
      date: "2026-11-02",
      weighIns: flatWeeks,
      measurements: [waist("2026-10-05", 75), waist("2026-11-02", 76)],
      targets: [],
      lifts,
      rules,
    });
    expect(oneToOne.ratio).toBe(1);
    expect(oneToOne.change).toMatchObject({ rule: "N3", kcalDelta: -150 });
  });

  it("changes nothing on a perfect month (N4)", () => {
    const r = monthlyAudit({
      date: "2026-11-02",
      weighIns: series(0.04),
      measurements: [waist("2026-10-05", 75), waist("2026-11-02", 75.5)],
      targets: [],
      lifts,
      rules,
    });
    expect(r.status).toBe("hold");
    expect(r.outcomes.map((o) => o.rule)).toEqual(["N4"]);
  });

  it("flags flat lifts as a sleep and training problem, not food (N5)", () => {
    const r = monthlyAudit({
      date: "2026-11-02",
      weighIns: series(0.04),
      measurements: [waist("2026-10-05", 75), waist("2026-11-02", 75.5)],
      targets: [],
      lifts: { up: false, flat: true, detail: "" },
      rules,
    });
    expect(r.outcomes.map((o) => o.rule)).toEqual(["N5"]);
    expect(r.change).toBeNull();
  });

  it("is blocked without a waist from about four weeks ago", () => {
    const r = monthlyAudit({
      date: "2026-11-02",
      weighIns: series(0.04),
      measurements: [waist("2026-11-02", 76.5)],
      targets: [],
      lifts,
      rules,
    });
    expect(r.status).toBe("blocked");
  });

  it("respects the cooldown for cuts", () => {
    const r = monthlyAudit({
      date: "2026-11-02",
      weighIns: series(0.04),
      measurements: [waist("2026-10-05", 75), waist("2026-11-02", 76.5)],
      targets: [target("2026-10-26", 2750, 410)],
      lifts,
      rules,
    });
    expect(r.status).toBe("cooldown");
    expect(r.change).toBeNull();
  });
});

describe("daily feedback", () => {
  const t = targetOn([], "2026-10-01");

  it("praises an on-target day", () => {
    const lines = dailyFeedback(nutrition("2026-10-01", 2640, 124, 380, 70), t, rules);
    expect(lines.every((l) => l.tone === "good")).toBe(true);
    expect(lines[0].text).toContain("On target");
  });

  it("names the gaps with foods from the plan", () => {
    const lines = dailyFeedback(nutrition("2026-10-01", 2200, 96, 300, 90), t, rules);
    const text = lines.map((l) => l.text).join(" ");
    expect(text).toContain("450 short");
    expect(text).toContain("24 g short");
    expect(text).toContain("whey is 24 g");
    expect(text).toContain("paneer");
    expect(text).toContain("85 g short");
  });

  it("flags totals whose macros don't add up", () => {
    const lines = dailyFeedback(nutrition("2026-10-01", 2650, 50, 100, 20), t, rules);
    expect(lines.some((l) => l.text.includes("add up to about"))).toBe(true);
  });

  it("says when nothing was logged", () => {
    expect(dailyFeedback(null, t, rules)).toEqual([{ tone: "info", text: "No Cronometer totals logged for that day." }]);
  });

  it("averages logged days only", () => {
    const days = [nutrition("2026-10-01", 2600, 120), nutrition("2026-10-03", 2700, 130)];
    expect(averageNutrition(days, "2026-10-01", "2026-10-07")).toMatchObject({ n: 2, kcal: 2650, protein: 125 });
    expect(averageNutrition(days, "2026-11-01", "2026-11-07")).toBeNull();
  });
});

describe("meal lines", () => {
  it("matches foods from the library, longest phrase first", () => {
    expect(matchFoods("3 egg whites and 2 eggs, paneer bhurji").map((f) => f.key)).toEqual(["egg_white", "egg", "paneer"]);
    expect(matchFoods("Chicken biryani with raita").map((f) => f.key)).toEqual(["chicken"]);
    expect(matchFoods("pizza")).toEqual([]);
  });

  it("warns about the plan's fat traps", () => {
    const notes = mealLineNotes("mutton curry and rice");
    expect(notes[0]).toMatchObject({ tone: "warn" });
    expect(notes[0].text).toContain("fat trap");
    expect(notes[1].text).toContain("Weigh it raw");
    expect(mealLineNotes("paneer tikka")[0].text).toContain("20 F");
  });
});
