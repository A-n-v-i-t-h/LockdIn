import { beforeEach, describe, expect, it } from "vitest";
import { buildCard, headlineSlot, loadText } from "@/lib/fitness/card";
import { computeMorning, inputsDigest, type EngineInput } from "@/lib/fitness/engine";
import { DEFAULT_GYM } from "@/lib/fitness/equipment";
import { computeProgression, makeBodyweightLookup, type LoggedSet } from "@/lib/fitness/progression";
import { readinessGate } from "@/lib/fitness/readiness";
import { RULES_V1 } from "@/lib/fitness/rules";
import { DEFAULT_SCHEDULE } from "@/lib/fitness/schedule";
import { SESSIONS } from "@/lib/fitness/program";
import { addDays } from "@/lib/time";
import { nutrition, resetIds, sets, target, waist, weighIn, weightSeries } from "../support/fixtures";

const rules = RULES_V1;
beforeEach(() => resetIds());

function card(date: string, logged: LoggedSet[] = [], gateOpen = true) {
  const bw = makeBodyweightLookup([weighIn("2026-09-21", 60)]);
  const p = computeProgression({ sets: logged, overrides: [], bodyweight: bw, before: date, rules, gym: DEFAULT_GYM });
  const gate = readinessGate({ phase: "full", sleepMinutes: gateOpen ? 480 : 300, yesterdayKcal: 2650, kcalTarget: 2650, rules });
  return buildCard({ date, schedule: DEFAULT_SCHEDULE, gym: DEFAULT_GYM, rules, ...p, sets: logged, gate, bodyweight: bw });
}

const baselineWeek = () => [
  ...sets("2026-09-21", "bench_heavy", [30, 35, 40, 42.5], [8, 8, 8, 8]),
  ...sets("2026-09-21", "ohp", [20, 25, 30], [8, 8, 8]),
  ...sets("2026-09-22", "pullup_weighted", [0, 2.5, 5], [8, 8, 8]),
  ...sets("2026-09-23", "back_squat", [40, 50, 60], [8, 8, 8]),
  ...sets("2026-09-26", "rdl", [40, 50, 60, 70], [8, 8, 8, 8]),
];

describe("workout card", () => {
  it("shows rest days with the reason", () => {
    expect(card("2026-10-11")).toMatchObject({ kind: "rest", restReason: expect.stringContaining("walk") });
    expect(card("2026-09-25")).toMatchObject({ kind: "rest", restReason: expect.stringContaining("five days") });
    expect(card("2026-09-01")).toMatchObject({ kind: "rest", phase: "pre" });
  });

  it("runs ramp-in days at two light sets", () => {
    const c = card("2026-09-17");
    expect(c.kind).toBe("train");
    expect(c.optionalDay).toBe(true);
    expect(c.slots.every((s) => s.status === "rampin" && s.sets === 2)).toBe(true);
    expect(c.notes[0]).toContain("trainer");
  });

  it("turns main lifts into baseline tests in week 3", () => {
    const c = card("2026-09-21");
    const bench = c.slots.find((s) => s.track === "bench_heavy")!;
    expect(bench).toMatchObject({ status: "baseline_test", weight: null, repTargets: [8, 8, 8, 8] });
    expect(loadText(bench)).toBe("Find your 8");
    const incline = c.slots.find((s) => s.track === "incline_db_press")!;
    expect(incline).toMatchObject({ status: "choose_load", weight: null, sets: 3 });
    expect(c.notes[0]).toContain("Baseline week");
  });

  it("prefills working loads from the baselines", () => {
    const c = card("2026-09-28", baselineWeek());
    const bench = c.slots.find((s) => s.track === "bench_heavy")!;
    expect(bench).toMatchObject({ status: "working", weight: 47.5, repTargets: [4, 4, 4], warmups: 1 });
    expect(bench.change).toMatchObject({ from: null, to: 47.5, rule: "B1" });
    expect(bench.plates?.map((p) => p.kg)).toEqual([10, 2.5, 1.25]);
    expect(headlineSlot(c)?.track).toBe("bench_heavy");
  });

  // He dropped the third bench session on 22 Sep to shorten Wednesday, from 23 Sep on.
  it("drops the speed bench from 23 September and leaves Wednesday on quads", () => {
    const before = card("2026-09-16");
    expect(before.slots.some((s) => s.track === "bench_speed")).toBe(true);
    const after = card("2026-09-23", baselineWeek());
    expect(after.slots.some((s) => s.track === "bench_speed")).toBe(false);
    expect(after.session).toMatchObject({ name: "Legs Q", focus: "Quads" });
    expect(after.slots.map((s) => s.track)).toEqual(["back_squat", "leg_press", "standing_leg_curl", "db_lateral_raise", "neck"]);
    expect(card("2026-10-07", baselineWeek()).slots.some((s) => s.track === "bench_speed")).toBe(false);
  });

  it("brings in the deadlift in week 5 at 60% of the 8-rep RDL", () => {
    const wk4 = card("2026-10-03", baselineWeek());
    expect(wk4.slots.some((s) => s.track === "deadlift")).toBe(false);
    expect(wk4.slots.find((s) => s.track === "rdl")!.sets).toBe(4);
    const wk5 = card("2026-10-10", baselineWeek());
    const dl = wk5.slots.find((s) => s.track === "deadlift")!;
    expect(dl).toMatchObject({ weight: 40, sets: 3, repTargets: [5, 5, 5] });
    expect(dl.change?.rule).toBe("B3");
    expect(wk5.slots.find((s) => s.track === "rdl")!.sets).toBe(3);
  });

  it("marks the new plates when the load goes up", () => {
    const c = card("2026-10-05", [...baselineWeek(), ...sets("2026-09-28", "bench_heavy", 47.5, [6, 6, 6, 6])]);
    const bench = c.slots.find((s) => s.track === "bench_heavy")!;
    expect(bench.weight).toBe(50);
    expect(bench.plates).toEqual([
      { kg: 15, fresh: true },
    ]);
    expect(bench.why).toContain("reached 6 reps");
  });

  it("allows a best-set attempt only when the gate is open and no deload is recent", () => {
    const logged = [
      ...baselineWeek(),
      ...sets("2026-09-28", "bench_heavy", 47.5, [3, 3, 3, 3]),
      ...sets("2026-10-05", "bench_heavy", 47.5, [3, 3, 3, 3]),
      ...sets("2026-10-12", "bench_heavy", 47.5, [3, 3, 3, 3]),
    ];
    const afterDeload = card("2026-10-19", logged);
    expect(afterDeload.slots.find((s) => s.track === "bench_heavy")).toMatchObject({ weight: 42.5, bestSetAllowed: false });
    expect(afterDeload.slots.find((s) => s.track === "ohp")!.bestSetAllowed).toBe(true);
    expect(card("2026-10-19", logged, false).slots.find((s) => s.track === "ohp")!.bestSetAllowed).toBe(false);
  });

  it("offers one substitute on every slot, with its own load once used", () => {
    const logged = [...baselineWeek(), ...sets("2026-09-28", "sub:incline_db_press:incline_smith_press", 30, [9, 9, 9], { exercise: "incline_smith_press", slot: "2" })];
    const c = card("2026-10-05", logged);
    expect(c.slots.every((s) => s.substitute !== null)).toBe(true);
    const incline = c.slots.find((s) => s.track === "incline_db_press")!;
    expect(incline.substitute).toMatchObject({ track: "sub:incline_db_press:incline_smith_press", weight: 30, repTargets: [10, 10, 10] });
  });

  it("never prescribes a single before December (A1) on any day", () => {
    for (let d = "2026-09-07"; d <= "2026-11-30"; d = addDays(d, 1)) {
      const c = card(d, baselineWeek());
      for (const s of c.slots) expect(Math.min(...s.repTargets)).toBeGreaterThan(1);
    }
  });

  it("lists every slot of the day's session in order", () => {
    const c = card("2026-10-06", baselineWeek());
    expect(c.slots.map((s) => s.slot)).toEqual(SESSIONS[1].slots.map((s) => s.slot));
    expect(c.totalSets).toBe(21);
    expect(c.session).toMatchObject({ name: "Pull A", cardio: "20 min easy (capped)" });
  });
});

// ---------------------------------------------------------------------------
// A simulated season through the whole engine
// ---------------------------------------------------------------------------

function season(until: string): Omit<EngineInput, "date" | "asOf" | "previousRunAsOf"> {
  const logged: LoggedSet[] = [
    ...sets("2026-09-15", "bench_heavy", 35, [6, 6]),
    ...baselineWeek(),
    ...sets("2026-09-28", "bench_heavy", 47.5, [6, 6, 6, 6]),
    ...sets("2026-10-01", "bench_volume", 42.5, [10, 10, 10, 10]),
    ...sets("2026-10-05", "bench_heavy", 50, [6, 5, 5, 5]),
    ...sets("2026-10-08", "bench_volume", 45, [10, 10, 9, 9]),
  ].filter((s) => s.date < until);
  const weighIns = [...weightSeries("2026-09-07", "2026-09-20", 57.7, 0.12), ...weightSeries("2026-09-21", addDays(until, 0), 59.5, 0.003)];
  const food = [] as ReturnType<typeof nutrition>[];
  for (let d = "2026-09-07"; d < until; d = addDays(d, 1)) food.push(nutrition(d, 2650));
  return {
    rules,
    gym: DEFAULT_GYM,
    schedule: DEFAULT_SCHEDULE,
    weighIns,
    nutrition: food,
    measurements: [waist("2026-09-21", 74), waist("2026-10-05", 74.5), waist("2026-10-12", 74.5)],
    sets: logged,
    overrides: [],
    targets: [],
  };
}

describe("morning engine", () => {
  it("produces a full, explained output", () => {
    const out = computeMorning({ ...season("2026-10-12"), date: "2026-10-12", asOf: "2026-10-12T02:00:00.000Z", previousRunAsOf: "2026-10-11T02:00:00.000Z" });
    expect(out).toMatchObject({ week: 6, phase: "full", rulesVersion: "v1" });
    expect(out.card.session?.key).toBe("push_a");
    expect(out.gate.status).toBe("open");
    expect(out.weekly?.status).toBe("change");
    expect(out.targets.change).toMatchObject({ rule: "N1", to: { kcal: 2750, carbs: 410, protein: 120, fat: 70 } });
    expect(out.changes.map((c) => c.kind)).toContain("calories");
    expect(out.note.lines.some((l) => l.kind === "review")).toBe(true);
    expect(out.note.number).toBe("Work order 1012");
    expect(out.morning.sevenDay.n).toBe(7);
    expect(out.missing).toEqual([]);
  });

  it("announces only changes caused by data newer than the last run", () => {
    const base = season("2026-10-06");
    const early = computeMorning({ ...base, date: "2026-10-06", asOf: "2026-10-06T02:00:00.000Z", previousRunAsOf: "2026-10-05T02:00:00.000Z" });
    const titles = early.changes.map((c) => c.title);
    // The Monday 5 Oct session (recorded that evening) is new; nothing earlier is repeated.
    expect(titles).toEqual([]);
    const late = computeMorning({ ...base, date: "2026-10-06", asOf: "2026-10-06T02:00:00.000Z", previousRunAsOf: "2026-09-20T02:00:00.000Z" });
    expect(late.changes.map((c) => c.title)).toEqual([
      "Bench (heavy) starts at 47.5 kg",
      "Bench (volume) starts at 42.5 kg",
      "Overhead Press starts at 30 kg",
      "Weighted Pull-up starts at BW+12.5 kg",
      "Pull-up (BW or light) starts at BW+5 kg",
      "Barbell Back Squat starts at 62.5 kg",
      "Romanian Deadlift starts at 70 kg",
      "Bench (heavy) 47.5 → 50 kg",
      "Bench (volume) 42.5 → 45 kg",
    ].map((t) => t.replace("Overhead Press", "Barbell Overhead Press")));
    expect(late.changes.find((c) => c.title.startsWith("Bench (heavy) 47.5"))!.effective).toBe("2026-10-05");
    const sinceBaselines = computeMorning({ ...base, date: "2026-10-06", asOf: "2026-10-06T02:00:00.000Z", previousRunAsOf: "2026-09-27T02:00:00.000Z" });
    expect(sinceBaselines.changes.map((c) => c.title)).toEqual(["Bench (heavy) 47.5 → 50 kg", "Bench (volume) 42.5 → 45 kg"]);
  });

  it("marks missing inputs instead of inferring them (M1)", () => {
    const base = season("2026-10-07");
    const out = computeMorning({
      ...base,
      weighIns: base.weighIns.filter((w) => w.date !== "2026-10-07"),
      nutrition: base.nutrition.filter((n) => n.date !== "2026-10-06"),
      sets: base.sets.filter((s) => s.date !== "2026-10-06"),
      date: "2026-10-07",
      asOf: "2026-10-07T02:00:00.000Z",
      previousRunAsOf: "2026-10-06T02:00:00.000Z",
    });
    expect(out.gate.status).toBe("missing");
    expect(out.missing.join(" ")).toContain("No weigh-in this morning");
    expect(out.missing.join(" ")).toContain("sleep");
    expect(out.missing.join(" ")).toContain("No Cronometer totals for Tue 6 Oct");
    expect(out.missing.join(" ")).toContain("No session logged for Tue 6 Oct (Pull A)");
    expect(out.morning.weight).toBeNull();
  });

  it("asks for the Monday waist", () => {
    const base = season("2026-10-19");
    const out = computeMorning({ ...base, date: "2026-10-19", asOf: "2026-10-19T02:00:00.000Z", previousRunAsOf: null });
    expect(out.weekly?.status).toBe("blocked");
    expect(out.missing.join(" ")).toContain("Monday waist");
    expect(out.targets.change).toBeNull();
  });

  it("re-decides a same-day calorie change instead of stacking it", () => {
    const base = season("2026-10-12");
    const input = { ...base, date: "2026-10-12", asOf: "2026-10-12T03:00:00.000Z", previousRunAsOf: "2026-10-11T02:00:00.000Z" };
    const first = computeMorning(input);
    const second = computeMorning({ ...input, targets: [target("2026-10-12", 2750, 410, "coach")] });
    expect(second.targets.change).toEqual(first.targets.change);
    expect(second.weekly?.status).toBe("change");
  });

  it("flags Phase 2 at a 65 kg average (N7)", () => {
    const base = season("2026-10-12");
    const out = computeMorning({
      ...base,
      weighIns: weightSeries("2026-10-01", "2026-10-12", 65.2, 0),
      date: "2026-10-12",
      asOf: "2026-10-12T02:00:00.000Z",
      previousRunAsOf: null,
    });
    expect(out.phase2.reached).toBe(true);
    expect(out.note.lines.some((l) => l.rule === "N7")).toBe(true);
  });

  it("is a pure function: same input, same output and digest", () => {
    const input = { ...season("2026-11-02"), date: "2026-11-02", asOf: "2026-11-02T02:00:00.000Z", previousRunAsOf: "2026-11-01T02:00:00.000Z" };
    const a = computeMorning(input);
    const b = computeMorning(structuredClone(input));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(inputsDigest(input)).toBe(inputsDigest(structuredClone(input)));
    expect(inputsDigest({ ...input, sets: input.sets.slice(1) })).not.toBe(inputsDigest(input));
    expect(a.replayDue).toBe(true);
    expect(a.monthly?.kind).toBe("monthly");
  });

  it("runs every day of the season without breaking a rule", () => {
    for (let d = "2026-09-07"; d <= "2026-12-06"; d = addDays(d, 1)) {
      const out = computeMorning({ ...season(d), date: d, asOf: `${d}T02:00:00.000Z`, previousRunAsOf: `${addDays(d, -1)}T02:00:00.000Z` });
      expect(out.date).toBe(d);
      expect(out.note.headline.length).toBeGreaterThan(5);
      if (out.card.kind === "train") expect(out.card.slots.length).toBeGreaterThan(0);
    }
  });
});
