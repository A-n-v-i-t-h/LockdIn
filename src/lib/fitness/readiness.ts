// Readiness gate: it sets intent, never load. Last night's sleep and yesterday's
// calories decide whether a best-set attempt is allowed; otherwise he runs the
// planned loads without reaching for more.
import { diffDays, fmtDuration } from "@/lib/time";
import type { RuleSet } from "./rules";
import type { Phase } from "./schedule";

export type GateStatus = "open" | "closed" | "missing" | "not_applicable";

export interface Gate {
  status: GateStatus;
  open: boolean;
  sleepMinutes: number | null;
  sleepOk: boolean | null;
  kcal: number | null;
  kcalTarget: number;
  kcalFraction: number | null;
  kcalOk: boolean | null;
  reasons: string[];
  rules: string[];
}

export function sleepMinutes(bedAt: string | null | undefined, wakeAt: string | null | undefined): number | null {
  if (!bedAt || !wakeAt) return null;
  const m = Math.round((Date.parse(wakeAt) - Date.parse(bedAt)) / 60_000);
  return m > 0 && m < 24 * 60 ? m : null;
}

export function readinessGate(input: {
  phase: Phase;
  sleepMinutes: number | null;
  yesterdayKcal: number | null;
  kcalTarget: number;
  rules: RuleSet;
}): Gate {
  const { rules } = input;
  const kcalFraction = input.yesterdayKcal === null ? null : input.yesterdayKcal / input.kcalTarget;
  const sleepOk = input.sleepMinutes === null ? null : input.sleepMinutes >= rules.readiness.minSleepMinutes;
  const kcalOk = kcalFraction === null ? null : kcalFraction >= rules.readiness.minKcalFraction;
  const base = {
    sleepMinutes: input.sleepMinutes,
    sleepOk,
    kcal: input.yesterdayKcal,
    kcalTarget: input.kcalTarget,
    kcalFraction,
    kcalOk,
  };

  if (input.phase === "pre" || input.phase === "rampin" || input.phase === "baseline") {
    return {
      ...base,
      status: "not_applicable",
      open: false,
      reasons: [
        input.phase === "baseline"
          ? "Baseline week: the test sets are the effort. No best-set attempts."
          : "Ramp-in: stop 4–5 reps short. No best-set attempts.",
      ],
      rules: ["R3", "A2"],
    };
  }

  const reasons: string[] = [];
  const missing: string[] = [];
  if (input.sleepMinutes === null) missing.push("last night's sleep");
  if (input.yesterdayKcal === null) missing.push("yesterday's calories");
  if (missing.length) {
    return {
      ...base,
      status: "missing",
      open: false,
      reasons: [`Not logged: ${missing.join(" and ")}. Run the planned loads without reaching for more.`],
      rules: ["R1", "M1"],
    };
  }

  const minSleep = fmtDuration(rules.readiness.minSleepMinutes);
  const minPct = Math.round(rules.readiness.minKcalFraction * 100);
  if (sleepOk) reasons.push(`Slept ${fmtDuration(input.sleepMinutes!)} (≥ ${minSleep}).`);
  else reasons.push(`Slept ${fmtDuration(input.sleepMinutes!)}, under ${minSleep}.`);
  if (kcalOk) reasons.push(`Ate ${Math.round(kcalFraction! * 100)}% of target yesterday (≥ ${minPct}%).`);
  else reasons.push(`Ate ${Math.round(kcalFraction! * 100)}% of target yesterday, under ${minPct}%.`);

  const open = !!sleepOk && !!kcalOk;
  return { ...base, status: open ? "open" : "closed", open, reasons, rules: ["R1"] };
}

/** R2: a best-set attempt waits two weeks after a deload of that lift. */
export function withinDeloadWindow(lastDeload: string | null, date: string, rules: RuleSet): boolean {
  if (!lastDeload) return false;
  return diffDays(date, lastDeload) <= rules.progression.prWindowAfterDeloadDays;
}
