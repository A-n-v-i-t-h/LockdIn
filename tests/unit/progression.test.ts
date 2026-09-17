import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_GYM } from "@/lib/fitness/equipment";
import {
  computeProgression,
  epley,
  estimatedMax,
  isChange,
  loadForReps,
  makeBodyweightLookup,
  type LoggedSet,
  type OverrideEvent,
} from "@/lib/fitness/progression";
import { RULES_V1 } from "@/lib/fitness/rules";
import { substituteTrack } from "@/lib/fitness/program";
import { override, resetIds, sets, weighIn } from "../support/fixtures";

const bw = makeBodyweightLookup([weighIn("2026-09-21", 59.5)]);

function run(all: LoggedSet[], overrides: OverrideEvent[] = [], before = "2026-12-31", gym = DEFAULT_GYM) {
  return computeProgression({ sets: all, overrides, bodyweight: bw, before, rules: RULES_V1, gym });
}

const benchTest = () => sets("2026-09-21", "bench_heavy", [30, 35, 40, 42.5], [8, 8, 8, 8]);

beforeEach(() => resetIds());

describe("maths", () => {
  it("estimates maxes with Epley and inverts it", () => {
    expect(epley(60, 6)).toBeCloseTo(72, 5);
    expect(epley(60, 1)).toBe(60);
    expect(epley(60, 0)).toBe(0);
    expect(loadForReps(epley(42.5, 10), 8, 2)).toBeCloseTo(42.5, 6);
  });

  it("looks up bodyweight from protocol weigh-ins only", () => {
    const lookup = makeBodyweightLookup([
      weighIn("2026-09-21", 59.5),
      weighIn("2026-09-25", 61, { protocolOk: false }),
      weighIn("2026-09-28", 60.2),
    ]);
    expect(lookup("2026-09-20")).toEqual({ kg: 59.5, source: "logged" });
    expect(lookup("2026-09-26")).toEqual({ kg: 59.5, source: "logged" });
    expect(lookup("2026-10-10")).toEqual({ kg: 60.2, source: "logged" });
    expect(makeBodyweightLookup([])("2026-10-10")).toEqual({ kg: 57.5, source: "profile" });
  });
});

describe("ramp-in", () => {
  it("keeps ramp-in sets out of progression", () => {
    const r = run([...sets("2026-09-14", "bench_heavy", 40, [8, 8]), ...sets("2026-09-15", "cs_row", 30, [10, 10])]);
    expect(r.states).toEqual({});
    expect(r.transitions).toEqual([]);
    expect(r.baselines).toEqual({});
  });
});

describe("week-3 baselines (B1)", () => {
  it("seeds heavy and volume bench from the 8-rep test", () => {
    const r = run(benchTest(), [], "2026-09-22");
    expect(r.baselines.bench.e1rm).toBeCloseTo(56.667, 2);
    expect(r.baselines.bench.testLoad).toBe(42.5);
    expect(r.states.bench_heavy).toMatchObject({ status: "active", weight: 47.5, repTargets: [4, 4, 4, 4], seed: "baseline" });
    expect(r.states.bench_volume).toMatchObject({ status: "active", weight: 42.5, repTargets: [8, 8, 8, 8] });
    const seeds = r.transitions.filter((t) => t.kind === "seed");
    expect(seeds.map((t) => [t.track, t.rule])).toEqual([
      ["bench_heavy", "B1"],
      ["bench_volume", "B1"],
    ]);
    expect(seeds[0].cited).toHaveLength(4);
  });

  it("does not judge the test session itself", () => {
    const r = run(benchTest());
    expect(r.transitions.some((t) => t.kind === "increase")).toBe(false);
    expect(r.states.bench_heavy.weight).toBe(47.5);
  });

  it("seeds pull-ups from total load, bodyweight included", () => {
    const r = run(sets("2026-09-22", "pullup_weighted", [0, 2.5, 5], [8, 8, 8]));
    expect(r.baselines.pullup.e1rm).toBeCloseTo(86, 6);
    expect(r.states.pullup_weighted.weight).toBe(12.5);
    expect(r.states.pullup_bw.weight).toBe(5);
  });

  it("estimates from sets short of 8 reps too", () => {
    const r = run(sets("2026-09-21", "bench_heavy", [40, 45], [8, 6]));
    // 45 × (6 + 2 in reserve) beats 40 × (8 + 2).
    expect(r.baselines.bench.e1rm).toBeCloseTo(57, 6);
  });

  it("treats the first session as the test when week 3 was missed", () => {
    const r = run(sets("2026-09-28", "bench_heavy", [40, 42.5], [8, 8]));
    expect(r.baselines.bench.date).toBe("2026-09-28");
    expect(r.states.bench_heavy.weight).toBe(47.5);
  });
});

describe("double progression", () => {
  it("adds one step when every set reaches the top of the range (P1)", () => {
    const r = run([...benchTest(), ...sets("2026-09-28", "bench_heavy", 47.5, [6, 6, 6, 6])]);
    expect(r.states.bench_heavy).toMatchObject({ weight: 50, repTargets: [4, 4, 4, 4], successes: 1, misses: 0 });
    const inc = r.transitions.find((t) => t.kind === "increase")!;
    expect(inc).toMatchObject({ rule: "P1", from: { weight: 47.5 }, to: { weight: 50 } });
    expect(inc.reason).toContain("47.5 kg");
    expect(isChange(inc)).toBe(true);
  });

  it("holds the load and adds a rep inside the range (P2)", () => {
    const r = run([...benchTest(), ...sets("2026-10-01", "bench_volume", 42.5, [10, 9, 8, 8])]);
    expect(r.states.bench_volume).toMatchObject({ weight: 42.5, repTargets: [10, 10, 9, 9], misses: 0 });
    expect(r.transitions.at(-1)).toMatchObject({ kind: "hold", rule: "P2" });
    expect(isChange(r.transitions.at(-1)!)).toBe(false);
  });

  it("asks for the missing sets when a session is cut short", () => {
    const r = run([...benchTest(), ...sets("2026-10-01", "bench_volume", 42.5, [10, 10])]);
    expect(r.states.bench_volume.repTargets).toEqual([10, 10, 8, 8]);
    expect(r.transitions.at(-1)!.reason).toContain("2 of 4 sets");
  });

  it("counts misses and deloads 10% on the third in a row (P3)", () => {
    const all = [
      ...benchTest(),
      ...sets("2026-10-01", "bench_volume", 42.5, [7, 6, 6, 6]),
      ...sets("2026-10-08", "bench_volume", 42.5, [7, 7, 6, 6]),
    ];
    const two = run(all);
    expect(two.states.bench_volume).toMatchObject({ weight: 42.5, misses: 2, repTargets: [8, 8, 8, 8] });
    const three = run([...all, ...sets("2026-10-15", "bench_volume", 42.5, [7, 6, 6, 5])]);
    expect(three.states.bench_volume).toMatchObject({ weight: 37.5, misses: 0, lastDeload: "2026-10-15", repTargets: [8, 8, 8, 8] });
    expect(three.transitions.at(-1)).toMatchObject({ kind: "deload", rule: "P3", from: { weight: 42.5 }, to: { weight: 37.5 } });
  });

  it("resets the miss count after a session inside the range", () => {
    const r = run([
      ...benchTest(),
      ...sets("2026-10-01", "bench_volume", 42.5, [7, 6, 6, 6]),
      ...sets("2026-10-08", "bench_volume", 42.5, [8, 8, 8, 8]),
      ...sets("2026-10-15", "bench_volume", 42.5, [7, 6, 6, 6]),
    ]);
    expect(r.states.bench_volume).toMatchObject({ weight: 42.5, misses: 1 });
  });

  it("stops at the heaviest dumbbell instead of inventing a load", () => {
    const gym = { ...DEFAULT_GYM, dumbbellMax: 12.5 };
    const r = run(sets("2026-09-22", "incline_db_curl", 12.5, [12, 12, 12, 12]), [], "2026-12-31", gym);
    expect(r.states.incline_db_curl.weight).toBe(12.5);
    expect(r.transitions.at(-1)).toMatchObject({ kind: "top" });
  });

  it("tracks reps-only exercises without a load", () => {
    const r = run([
      ...sets("2026-09-24", "hanging_leg_raise", null, [12, 11, 10]),
      ...sets("2026-10-08", "hanging_leg_raise", null, [15, 15, 15]),
    ]);
    expect(r.states.hanging_leg_raise).toMatchObject({ weight: null, repTargets: [15, 15, 15] });
    expect(r.transitions.map((t) => t.kind)).toEqual(["hold", "top"]);
  });
});

describe("accessory seeds (B2)", () => {
  it("starts from the first logged session and judges it", () => {
    const r = run(sets("2026-09-22", "cs_row", 40, [10, 10, 9, 8]));
    expect(r.states.cs_row).toMatchObject({ weight: 40, repTargets: [10, 10, 10, 9], seed: "log" });
    expect(r.transitions.map((t) => [t.kind, t.rule])).toEqual([
      ["seed", "B2"],
      ["hold", "P2"],
    ]);
  });

  it("goes up straight away when the chosen load was easy", () => {
    const r = run(sets("2026-09-22", "incline_db_curl", 10, [12, 12, 12, 12]));
    expect(r.states.incline_db_curl.weight).toBe(12.5);
  });

  it("seeds from the heaviest set that reached the range", () => {
    const r = run(sets("2026-09-22", "cs_row", [30, 40, 45], [12, 10, 6]));
    expect(r.states.cs_row.weight).toBe(40);
  });
});

describe("the log is truth (P4) and one change per week (P5)", () => {
  it("follows a lighter load and holds the increase for a week", () => {
    const r1 = run([...benchTest(), ...sets("2026-10-01", "bench_volume", 40, [10, 10, 10, 10])]);
    expect(r1.transitions.slice(-2).map((t) => [t.kind, t.rule])).toEqual([
      ["follow_log", "P4"],
      ["blocked_week", "P5"],
    ]);
    expect(r1.states.bench_volume).toMatchObject({ weight: 40, repTargets: [10, 10, 10, 10] });
    const r2 = run([
      ...benchTest(),
      ...sets("2026-10-01", "bench_volume", 40, [10, 10, 10, 10]),
      ...sets("2026-10-08", "bench_volume", 40, [10, 10, 10, 10]),
    ]);
    expect(r2.states.bench_volume.weight).toBe(42.5);
  });

  it("judges mixed-load sessions at the planned load", () => {
    const r = run([...benchTest(), ...sets("2026-10-01", "bench_volume", [42.5, 42.5, 40, 40], [10, 10, 10, 10])]);
    expect(r.states.bench_volume.weight).toBe(42.5);
    expect(r.transitions.at(-1)).toMatchObject({ kind: "hold" });
  });

  it("allows one load change per lift per week when a lift appears twice", () => {
    const r = run([
      ...sets("2026-10-05", "cable_lateral_raise", 10, [15, 15, 15, 15]),
      ...sets("2026-10-08", "cable_lateral_raise", 15, [15, 15, 15, 15]),
    ]);
    expect(r.states.cable_lateral_raise.weight).toBe(15);
    expect(r.transitions.map((t) => t.kind)).toEqual(["seed", "increase", "blocked_week"]);
    const next = run([
      ...sets("2026-10-05", "cable_lateral_raise", 10, [15, 15, 15, 15]),
      ...sets("2026-10-08", "cable_lateral_raise", 15, [15, 15, 15, 15]),
      ...sets("2026-10-12", "cable_lateral_raise", 15, [15, 15, 15, 15]),
    ]);
    expect(next.states.cable_lateral_raise.weight).toBe(20);
  });

  it("postpones a deload that would be a second change in the week", () => {
    const r = run([
      ...benchTest(),
      ...sets("2026-10-01", "bench_volume", 42.5, [7, 6, 6, 6]),
      ...sets("2026-10-08", "bench_volume", 42.5, [7, 6, 6, 6]),
      ...sets("2026-10-15", "bench_volume", 40, [7, 6, 6, 6]),
    ]);
    expect(r.states.bench_volume).toMatchObject({ weight: 40, misses: 3, lastDeload: null });
    expect(r.transitions.at(-1)!.reason).toContain("deload waits");
    const later = run([
      ...benchTest(),
      ...sets("2026-10-01", "bench_volume", 42.5, [7, 6, 6, 6]),
      ...sets("2026-10-08", "bench_volume", 42.5, [7, 6, 6, 6]),
      ...sets("2026-10-15", "bench_volume", 40, [7, 6, 6, 6]),
      ...sets("2026-10-22", "bench_volume", 40, [7, 6, 6, 6]),
    ]);
    expect(later.states.bench_volume).toMatchObject({ weight: 35, lastDeload: "2026-10-22" });
  });
});

describe("overrides (O1)", () => {
  it("sets the load, logs the change and holds the week", () => {
    const r = run([...benchTest(), ...sets("2026-10-05", "bench_heavy", 45, [6, 6, 6, 6])], [
      override("2026-10-05", "bench_heavy", "weight", 45, "Shoulder felt off"),
    ]);
    const ov = r.transitions.find((t) => t.kind === "override")!;
    expect(ov).toMatchObject({ rule: "O1", from: { weight: 47.5 }, to: { weight: 45 } });
    expect(ov.reason).toContain("Shoulder felt off");
    expect(r.states.bench_heavy.weight).toBe(45);
    expect(r.transitions.at(-1)!.kind).toBe("blocked_week");
  });

  it("snaps an override to a loadable weight and ignores junk", () => {
    const r = run(benchTest(), [
      override("2026-09-23", "bench_volume", "weight", 43.7),
      override("2026-09-23", "bench_volume", "weight", "abc"),
      override("2026-09-23", "nope", "weight", 50),
    ]);
    expect(r.states.bench_volume.weight).toBe(42.5);
    expect(r.transitions.filter((t) => t.kind === "override")).toHaveLength(1);
  });

  it("can set rep targets within the range", () => {
    const r = run(benchTest(), [override("2026-09-23", "bench_volume", "reps", [12, 9, 3, 9])]);
    expect(r.states.bench_volume.repTargets).toEqual([10, 9, 8, 9]);
  });

  it("applies an override before that day's session", () => {
    const r = run(
      [...benchTest(), ...sets("2026-10-08", "bench_volume", 40, [10, 10, 10, 10])],
      [override("2026-10-08", "bench_volume", "weight", 40)],
    );
    // The override set 40 before the session, so there is no follow-log step.
    expect(r.transitions.some((t) => t.kind === "follow_log")).toBe(false);
  });

  it("applies an override made on the run day to that day's card", () => {
    const r = run(benchTest(), [override("2026-10-01", "bench_volume", "weight", 40, "Elbow")], "2026-10-01");
    expect(r.states.bench_volume.weight).toBe(40);
    expect(r.transitions.at(-1)).toMatchObject({ kind: "override", rule: "O1" });
    const later = run(benchTest(), [override("2026-10-02", "bench_volume", "weight", 40)], "2026-10-01");
    expect(later.states.bench_volume.weight).toBe(42.5);
  });

  it("only applies sessions dated before the run day", () => {
    const r = run([...benchTest(), ...sets("2026-09-28", "bench_heavy", 47.5, [6, 6, 6, 6])], [], "2026-09-28");
    expect(r.states.bench_heavy.weight).toBe(47.5);
  });
});

describe("history handling", () => {
  it("keeps substitutes on their own track", () => {
    const sub = substituteTrack("smith_bench_press", "bench_volume");
    const r = run([...benchTest(), ...sets("2026-10-01", sub, 30, [10, 10, 10, 10], { exercise: "smith_bench_press", slot: "1" })]);
    expect(r.states.bench_volume).toMatchObject({ weight: 42.5, lastSession: null });
    expect(r.states[sub]).toMatchObject({ exercise: "smith_bench_press", weight: 32.5 });
  });

  it("leaves a lift untouched when its session wasn't logged (M1)", () => {
    const a = run(benchTest(), [], "2026-10-02");
    const b = run(benchTest(), [], "2026-10-09");
    expect(b.states.bench_volume).toEqual(a.states.bench_volume);
  });

  it("ignores warm-up sets", () => {
    const r = run([
      ...benchTest(),
      ...sets("2026-09-28", "bench_heavy", 30, [5, 5], { warmup: true }),
      ...sets("2026-09-28", "bench_heavy", 47.5, [6, 6, 6, 6]),
    ]);
    expect(r.states.bench_heavy.weight).toBe(50);
  });

  it("is deterministic regardless of input order", () => {
    const all = [
      ...benchTest(),
      ...sets("2026-09-22", "pullup_weighted", [0, 2.5, 5], [8, 8, 8]),
      ...sets("2026-09-28", "bench_heavy", 47.5, [6, 6, 5, 5]),
      ...sets("2026-10-01", "bench_volume", 42.5, [10, 10, 10, 10]),
      ...sets("2026-10-06", "pullup_weighted", 12.5, [6, 6, 6, 6]),
    ];
    const ovs = [override("2026-10-02", "cs_row", "weight", 40)];
    const a = run(all, ovs);
    const shuffled = [...all].reverse();
    const b = run(shuffled, ovs);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
});

describe("gym changes mid-season", () => {
  it("never jumps more than one step when loads fall off the new grid", () => {
    const all = [
      ...sets("2026-09-22", "preacher_curl", 22.5, [12, 12, 12]),
      ...sets("2026-09-29", "preacher_curl", 25, [12, 12, 12]),
      ...benchTest(),
      ...sets("2026-09-28", "bench_heavy", 47.5, [6, 6, 6, 6]),
    ];
    // The smallest plate is now 2.5 kg, so bar and plate-loaded jumps are 5 kg.
    const noSmallPlates = { ...DEFAULT_GYM, plates: [20, 10, 5, 2.5] };
    const r = run(all, [], "2026-12-31", noSmallPlates);
    const increases = r.transitions.filter((t) => t.kind === "increase");
    expect(increases.length).toBeGreaterThan(0);
    for (const t of increases) {
      const jump = t.to.weight! - t.from!.weight!;
      expect(jump).toBeGreaterThan(0);
      expect(jump).toBeLessThanOrEqual(5);
    }
    // 22.5 sits between the 5 kg marks: the next load is 25, not 30.
    expect(increases[0]).toMatchObject({ track: "preacher_curl", from: { weight: 22.5 }, to: { weight: 25 } });
  });
});

describe("estimated max", () => {
  it("prefers recent working sets over the baseline", () => {
    const all = [...benchTest(), ...sets("2026-10-01", "bench_volume", 45, [10, 10, 10, 10])];
    const r = run(all);
    const max = estimatedMax("bench", all, r.baselines, "2026-10-07", 28, bw);
    expect(max).toMatchObject({ source: "sets", date: "2026-10-01" });
    expect(max!.e1rm).toBeCloseTo(60, 6);
  });

  it("falls back to the baseline when there are no recent sets", () => {
    const r = run(benchTest());
    const max = estimatedMax("bench", benchTest(), r.baselines, "2026-12-01", 28, bw);
    expect(max).toMatchObject({ source: "baseline" });
    expect(estimatedMax("bench", [], {}, "2026-12-01", 28, bw)).toBeNull();
  });
});
