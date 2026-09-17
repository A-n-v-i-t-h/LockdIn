import { describe, expect, it } from "vitest";
import {
  DEFAULT_GYM,
  fmtKg,
  isLoadable,
  plateDiff,
  platesPerSide,
  roundTo,
  sanitiseGym,
  stepFor,
  toLoadable,
  type GymSettings,
} from "@/lib/fitness/equipment";

const gym = (over: Partial<GymSettings> = {}): GymSettings => ({ ...DEFAULT_GYM, ...over });

describe("increments", () => {
  it("uses 2.5 kg upper and 5 kg lower barbell jumps with 1.25 kg plates", () => {
    expect(stepFor("bench_press", gym())).toBe(2.5);
    expect(stepFor("ohp", gym())).toBe(2.5);
    expect(stepFor("back_squat", gym())).toBe(5);
    expect(stepFor("rdl", gym())).toBe(5);
    expect(stepFor("leg_press", gym())).toBe(10);
    expect(stepFor("lp_calf_raise", gym())).toBe(5);
  });

  it("doubles the upper jump when the smallest plate is 2.5 kg (the OHP concern in the plan)", () => {
    const g = gym({ plates: [20, 10, 5, 2.5] });
    expect(stepFor("ohp", g)).toBe(5);
    expect(stepFor("bench_press", g)).toBe(5);
    expect(stepFor("back_squat", g)).toBe(5);
    expect(stepFor("pullup", g)).toBe(2.5);
    expect(stepFor("neck", g)).toBe(2.5);
  });

  it("keeps every step on the loadable grid with micro plates", () => {
    const g = gym({ plates: [20, 10, 5, 2.5, 1.25, 0.5] });
    expect(stepFor("bench_press", g)).toBe(2);
    expect(stepFor("back_squat", g)).toBe(5);
    expect(stepFor("pullup", g)).toBe(2.5);
    for (const ex of ["bench_press", "ohp", "back_squat", "rdl"]) {
      const step = stepFor(ex, g);
      expect(isLoadable(ex, 40 + step, g)).toBe(true);
    }
  });

  it("uses the dumbbell and cable steps", () => {
    expect(stepFor("incline_db_press", gym({ dumbbellStep: 2 }))).toBe(2);
    expect(stepFor("cable_lateral_raise", gym({ cableStep: 2.5 }))).toBe(2.5);
    expect(stepFor("reverse_pec_deck", gym({ cableStep: 7 }))).toBe(7);
    expect(stepFor("hanging_leg_raise", gym())).toBe(0);
  });
});

describe("loadable weights", () => {
  it("snaps barbell loads to bar + pairs of plates", () => {
    expect(toLoadable("bench_press", 48.57, gym())).toBe(47.5);
    expect(toLoadable("bench_press", 48.57, gym(), "nearest")).toBe(47.5);
    expect(toLoadable("bench_press", 49, gym(), "nearest")).toBe(50);
    expect(toLoadable("bench_press", 10, gym())).toBe(20);
    expect(toLoadable("bench_press", 48.57, gym({ barKg: 15 }))).toBe(47.5);
    expect(toLoadable("bench_press", 49, gym({ barKg: 15 }))).toBe(47.5);
  });

  it("snaps dumbbells, cables and the belt", () => {
    expect(toLoadable("incline_db_press", 13.4, gym())).toBe(12.5);
    expect(toLoadable("incline_db_press", 1, gym())).toBe(2.5);
    expect(toLoadable("incline_db_press", 80, gym())).toBe(50);
    expect(toLoadable("cable_lateral_raise", 12, gym())).toBe(10);
    expect(toLoadable("pullup", 13.18, gym())).toBe(12.5);
    expect(toLoadable("pullup", -3, gym())).toBe(0);
    expect(toLoadable("hanging_leg_raise", 10, gym())).toBe(0);
  });

  it("rounds without floating-point residue", () => {
    expect(roundTo(0.1 + 0.2, 0.1)).toBe(0.3);
    expect(roundTo(47.49999999, 2.5, "down")).toBe(47.5);
    expect(roundTo(47.50000001, 2.5, "up")).toBe(47.5);
  });
});

describe("plates", () => {
  it("breaks a bar load into plates per side", () => {
    expect(platesPerSide(47.5, gym())).toEqual([10, 2.5, 1.25]);
    expect(platesPerSide(20, gym())).toEqual([]);
    expect(platesPerSide(102.5, gym())).toEqual([25, 15, 1.25]);
    expect(platesPerSide(47.5, gym({ plates: [20, 10, 5, 2.5] }))).toBeNull();
    expect(platesPerSide(15, gym())).toBeNull();
  });

  it("marks the plates that are new tonight", () => {
    expect(plateDiff(45, 47.5, gym())).toEqual({
      plates: [
        { kg: 10, fresh: false },
        { kg: 2.5, fresh: false },
        { kg: 1.25, fresh: true },
      ],
    });
    expect(plateDiff(null, 60, gym())?.plates.every((p) => !p.fresh)).toBe(true);
    expect(plateDiff(60, 57.5, gym())?.plates.map((p) => p.fresh)).toEqual([true, true, true]);
  });
});

describe("gym settings", () => {
  it("sanitises stored values and keeps defaults for junk", () => {
    const g = sanitiseGym({ barKg: 999, plates: [2.5, "x" as unknown as number, 1.25, 2.5], dumbbellStep: 2, cableStep: -1 });
    expect(g.barKg).toBe(20);
    expect(g.plates).toEqual([2.5, 1.25]);
    expect(g.dumbbellStep).toBe(2);
    expect(g.cableStep).toBe(5);
    expect(g.confirmed).toEqual({ bar: false, plates: false, dumbbells: false, cable: false });
    expect(sanitiseGym(null)).toEqual(DEFAULT_GYM);
  });

  it("formats kilograms", () => {
    expect(fmtKg(47.5)).toBe("47.5");
    expect(fmtKg(50)).toBe("50");
    expect(fmtKg(12.3456)).toBe("12.35");
    expect(fmtKg(null)).toBe("—");
  });
});
