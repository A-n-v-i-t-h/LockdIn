// Versioned rules. Every number the coach acts on lives here; rules/RULES.md is
// the readable copy. Changing any value means a new version: add it to
// RULE_SETS (old versions stay callable, so the monthly replay can reproduce
// prescriptions made under them) and update RULES.md.

export interface RuleSet {
  version: string;
  progression: {
    missesBeforeDeload: number;
    deloadFraction: number;
    maxDeloadFraction: number;
    prWindowAfterDeloadDays: number;
  };
  baseline: {
    testReps: number;
    assumedRir: number;
    minRepsForEstimate: number;
    deadliftFractionOfRdl: number;
  };
  readiness: {
    minSleepMinutes: number;
    minKcalFraction: number;
  };
  nutrition: {
    carbStepG: number;
    kcalPerCarbG: number;
    flatTwoWeekGainKg: number;
    minReadingsPerWeek: number;
    cooldownDays: number;
    waistMaxAgeDays: number;
    waistCutCmPerMonth: number;
    cutKcal: number;
    perfectMonthlyGainKg: [number, number];
    perfectWaistMaxCm: number;
    ratioWarnCmPerKg: number;
    ratioCutCmPerKg: number;
    ratioMinGainKg: number;
    liftsFlatWeeks: number;
    phase2AtKg: number;
    phase1RatePct: [number, number];
    phase2RatePct: [number, number];
    feedbackTolerance: number;
  };
  bests: { minReps: number; maxReps: number };
  speedBench: { lookbackDays: number };
}

export const RULES_V1: RuleSet = {
  version: "v1",
  progression: {
    missesBeforeDeload: 3,
    deloadFraction: 0.1,
    maxDeloadFraction: 0.2,
    prWindowAfterDeloadDays: 14,
  },
  baseline: {
    testReps: 8,
    assumedRir: 2,
    minRepsForEstimate: 3,
    deadliftFractionOfRdl: 0.6,
  },
  readiness: {
    // Placeholders until about six weeks of his own data exist.
    minSleepMinutes: 7 * 60,
    minKcalFraction: 0.9,
  },
  nutrition: {
    carbStepG: 25,
    kcalPerCarbG: 4,
    flatTwoWeekGainKg: 0.15,
    minReadingsPerWeek: 4,
    cooldownDays: 14,
    waistMaxAgeDays: 6,
    waistCutCmPerMonth: 1.0,
    cutKcal: 150,
    perfectMonthlyGainKg: [1.0, 1.25],
    perfectWaistMaxCm: 0.5,
    ratioWarnCmPerKg: 0.5,
    ratioCutCmPerKg: 1.0,
    ratioMinGainKg: 1.0,
    liftsFlatWeeks: 3,
    phase2AtKg: 65,
    phase1RatePct: [0.4, 0.5],
    phase2RatePct: [0.25, 0.3],
    feedbackTolerance: 0.05,
  },
  bests: { minReps: 6, maxReps: 12 },
  speedBench: { lookbackDays: 28 },
};

export const RULE_SETS: Record<string, RuleSet> = { v1: RULES_V1 };
export const CURRENT_RULES = RULES_V1;

/** Short names for the rules a change can cite. */
export const RULE_TEXT: Record<string, string> = {
  P1: "Double progression: every set at the top of the range → add one step",
  P2: "Inside the range → same load, one more rep per set",
  P3: "A set below the range is a miss; the third miss in a row → deload 10%",
  P4: "The card is a target, the log is truth: the next target follows what you lifted",
  P5: "One load change per lift per week",
  P6: "Never more than one step per session",
  B1: "Week-3 baseline: working loads come from the 8-rep test",
  B2: "Accessories start from the first logged working session",
  B3: "Deadlift enters in week 5 at 60% of the 8-rep RDL",
  S1: "Speed bench: 60% of the current estimated bench max",
  R1: "Readiness gate: 7 h sleep and 90% of yesterday's calories allow a best-set attempt",
  R2: "No best-set attempt within 14 days of a deload",
  R3: "No best-set attempts during ramp-in or the baseline week",
  N1: "Weight average flat for 2+ weeks → +25 g carbs (+100 kcal)",
  N2: "Waist up more than 1 cm in a month while weight climbs → −150 kcal",
  N3: "Waist should grow ≤ 1 cm per 2 kg gained; near 1:1 means too fast",
  N4: "Weight +1.0–1.25 kg a month, waist ≤ +0.5 cm, lifts up → change nothing",
  N5: "Weight up but lifts flat 3+ weeks → not a food problem: audit sleep, then training",
  N6: "Nothing moves on a single day: weekly averages, a waist reading, 14 days between changes",
  N7: "At 65 kg, switch to the Phase 2 rate and recalculate calories",
  M1: "Missing data is shown as missing; a day with no log repeats the card",
  O1: "Manual override",
  A1: "No 1RM testing before December 2026",
  A2: "The ramp-in schedule governs until week 5",
};

export function rulesFor(version: string): RuleSet | null {
  return RULE_SETS[version] ?? null;
}
