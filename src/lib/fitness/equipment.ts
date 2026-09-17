import { exercise, type ExerciseDef } from "./program";

/**
 * What the gym can load. Every value starts as an assumption; the plan lists
 * them as unknown (bar weight, smallest plate, dumbbell step, cable step).
 * Progression increments come from here, so the app flags unconfirmed values.
 */
export interface GymSettings {
  barKg: number;
  /** Plate sizes available, per plate. */
  plates: number[];
  dumbbellStep: number;
  dumbbellMin: number;
  dumbbellMax: number;
  cableStep: number;
  confirmed: {
    bar: boolean;
    plates: boolean;
    dumbbells: boolean;
    cable: boolean;
  };
}

export const DEFAULT_GYM: GymSettings = {
  barKg: 20,
  plates: [25, 20, 15, 10, 5, 2.5, 1.25],
  dumbbellStep: 2.5,
  dumbbellMin: 2.5,
  dumbbellMax: 50,
  cableStep: 5,
  confirmed: { bar: false, plates: false, dumbbells: false, cable: false },
};

const EPS = 1e-6;

export function roundTo(value: number, step: number, mode: "down" | "nearest" | "up" = "nearest"): number {
  if (step <= 0) return value;
  const q = value / step;
  const n = mode === "down" ? Math.floor(q + EPS) : mode === "up" ? Math.ceil(q - EPS) : Math.round(q);
  return Math.round(n * step * 1000) / 1000;
}

export function smallestPlate(gym: GymSettings): number {
  return Math.min(...gym.plates);
}

/**
 * The largest multiple of `grid` that doesn't exceed the preferred jump, never
 * less than one grid unit. Keeps every step loadable, so "one step" is exact.
 */
function stepOnGrid(preferred: number, grid: number): number {
  if (grid >= preferred) return grid;
  return Math.round(Math.floor(preferred / grid + EPS) * grid * 1000) / 1000;
}

/** The single progression step for an exercise, in kg. Zero means reps-only. */
export function stepFor(ex: ExerciseDef | string, gym: GymSettings): number {
  const d = typeof ex === "string" ? exercise(ex) : ex;
  const plate = smallestPlate(gym);
  const pair = 2 * plate;
  switch (d.equipment) {
    case "barbell":
    case "ezbar":
    case "smith":
    case "plate_machine":
      return stepOnGrid(d.stepOverride ?? (d.lower ? 5 : 2.5), pair);
    case "sled":
      return stepOnGrid(d.stepOverride ?? 10, pair);
    case "dumbbell":
      return gym.dumbbellStep;
    case "cable":
    case "stack":
      return gym.cableStep;
    case "belt":
      return stepOnGrid(2.5, plate);
    case "plate":
      return stepOnGrid(1.25, plate);
    case "none":
      return 0;
  }
}

/** The grid of loads that can actually be set up for an exercise. */
export function loadGrid(ex: ExerciseDef, gym: GymSettings): { base: number; step: number; min: number; max: number } {
  const pair = 2 * smallestPlate(gym);
  switch (ex.equipment) {
    case "barbell":
      return { base: gym.barKg, step: pair, min: gym.barKg, max: 400 };
    case "dumbbell":
      return { base: 0, step: gym.dumbbellStep, min: gym.dumbbellMin, max: gym.dumbbellMax };
    case "cable":
    case "stack":
      return { base: 0, step: gym.cableStep, min: gym.cableStep, max: 200 };
    case "belt":
      return { base: 0, step: smallestPlate(gym), min: 0, max: 80 };
    case "plate":
      return { base: 0, step: smallestPlate(gym), min: 0, max: 25 };
    case "none":
      return { base: 0, step: 0, min: 0, max: 0 };
    default:
      return { base: 0, step: pair, min: 0, max: 500 };
  }
}

/** Snap a load onto what the gym can set up. */
export function toLoadable(ex: ExerciseDef | string, kg: number, gym: GymSettings, mode: "down" | "nearest" | "up" = "down"): number {
  const d = typeof ex === "string" ? exercise(ex) : ex;
  const g = loadGrid(d, gym);
  if (g.step === 0) return 0;
  const snapped = g.base + roundTo(kg - g.base, g.step, mode);
  return Math.min(g.max, Math.max(g.min, Math.round(snapped * 1000) / 1000));
}

export function isLoadable(ex: ExerciseDef | string, kg: number, gym: GymSettings): boolean {
  return Math.abs(toLoadable(ex, kg, gym, "nearest") - kg) < 1e-6;
}

/** Plates on one side of a barbell, largest first. Null if the load can't be made exactly. */
export function platesPerSide(totalKg: number, gym: GymSettings): number[] | null {
  let remaining = (totalKg - gym.barKg) / 2;
  if (remaining < -EPS) return null;
  const sizes = [...gym.plates].sort((a, b) => b - a);
  const out: number[] = [];
  for (const p of sizes) {
    while (remaining + EPS >= p) {
      out.push(p);
      remaining = Math.round((remaining - p) * 1000) / 1000;
    }
  }
  return Math.abs(remaining) < EPS ? out : null;
}

/**
 * Which plates on tonight's bar weren't on it last time. Returns tonight's plates
 * with a `fresh` flag, so the diagram can mark what to add at the rack.
 */
export function plateDiff(
  previousKg: number | null,
  currentKg: number,
  gym: GymSettings,
): { plates: { kg: number; fresh: boolean }[] } | null {
  const now = platesPerSide(currentKg, gym);
  if (!now) return null;
  const before = previousKg === null ? null : platesPerSide(previousKg, gym);
  if (!before) return { plates: now.map((kg) => ({ kg, fresh: false })) };
  const pool = [...before];
  return {
    plates: now.map((kg) => {
      const i = pool.findIndex((p) => Math.abs(p - kg) < EPS);
      if (i >= 0) {
        pool.splice(i, 1);
        return { kg, fresh: false };
      }
      return { kg, fresh: true };
    }),
  };
}

export function fmtKg(kg: number | null | undefined): string {
  if (kg === null || kg === undefined || Number.isNaN(kg)) return "—";
  return Number.isInteger(kg) ? String(kg) : String(Math.round(kg * 100) / 100);
}

export function gymIsConfirmed(gym: GymSettings): boolean {
  return gym.confirmed.bar && gym.confirmed.plates && gym.confirmed.dumbbells && gym.confirmed.cable;
}

export function sanitiseGym(input: Partial<GymSettings> | null | undefined): GymSettings {
  const g = { ...DEFAULT_GYM, ...(input ?? {}) };
  const plates = Array.isArray(g.plates)
    ? [...new Set(g.plates.map(Number).filter((p) => Number.isFinite(p) && p > 0 && p <= 50))].sort((a, b) => b - a)
    : DEFAULT_GYM.plates;
  const num = (v: unknown, lo: number, hi: number, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= lo && n <= hi ? n : fallback;
  };
  return {
    barKg: num(g.barKg, 5, 30, DEFAULT_GYM.barKg),
    plates: plates.length ? plates : DEFAULT_GYM.plates,
    dumbbellStep: num(g.dumbbellStep, 0.5, 10, DEFAULT_GYM.dumbbellStep),
    dumbbellMin: num(g.dumbbellMin, 0.5, 20, DEFAULT_GYM.dumbbellMin),
    dumbbellMax: num(g.dumbbellMax, 5, 100, DEFAULT_GYM.dumbbellMax),
    cableStep: num(g.cableStep, 0.5, 20, DEFAULT_GYM.cableStep),
    confirmed: {
      bar: !!g.confirmed?.bar,
      plates: !!g.confirmed?.plates,
      dumbbells: !!g.confirmed?.dumbbells,
      cable: !!g.confirmed?.cable,
    },
  };
}
