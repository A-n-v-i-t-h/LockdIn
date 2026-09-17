// Nutrition cadence: log daily, review weekly on 7-day averages, change calories
// only through the decision table in 04-tracking.md. Nothing moves on a single day.
// Protein and fat are frozen; carbs are the only dial.
import { addDays, diffDays, fmtShort, weekStart } from "@/lib/time";
import { FOODS, kcalOf, matchFoods } from "./foods";
import type { RuleSet } from "./rules";
import { BASELINE_WEEK_START } from "./program";

export interface WeighIn {
  id: string;
  date: string;
  weight: number | null;
  protocolOk: boolean;
  bedAt: string | null;
  wakeAt: string | null;
  recordedAt: string;
}

export interface NutritionDay {
  id: string;
  date: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  note: string;
  recordedAt: string;
}

export interface Measurement {
  id: string;
  date: string;
  kind: string;
  valueCm: number;
  recordedAt: string;
}

export interface Targets {
  id: string;
  effectiveDate: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  source: "plan" | "coach" | "override";
  reason: string;
  recordedAt: string;
}

export const PLAN_TARGETS = { kcal: 2650, protein: 120, carbs: 385, fat: 70, effectiveDate: "2026-09-07" } as const;

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Weigh-ins that count: taken under the fixed conditions and with a number. */
export function countable(weighIns: WeighIn[]): WeighIn[] {
  return weighIns.filter((w) => w.protocolOk && w.weight !== null);
}

export function averageOver(weighIns: WeighIn[], from: string, to: string): { avg: number | null; n: number } {
  const xs = countable(weighIns)
    .filter((w) => w.date >= from && w.date <= to)
    .map((w) => w.weight as number);
  const a = avg(xs);
  return { avg: a === null ? null : r2(a), n: xs.length };
}

/** 7-day rolling average ending on `date` (inclusive). */
export function sevenDayAverage(weighIns: WeighIn[], date: string) {
  return averageOver(weighIns, addDays(date, -6), date);
}

/** Rolling-average series for charts: one point per day that has at least one reading in its window. */
export function rollingSeries(weighIns: WeighIn[], from: string, to: string) {
  const out: { date: string; avg: number | null; daily: number | null; n: number }[] = [];
  const byDate = new Map(countable(weighIns).map((w) => [w.date, w.weight as number]));
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const s = sevenDayAverage(weighIns, d);
    out.push({ date: d, avg: s.avg, daily: byDate.get(d) ?? null, n: s.n });
  }
  return out;
}

export function targetOn(targets: Targets[], date: string): Targets {
  const eligible = targets
    .filter((t) => t.effectiveDate <= date)
    .sort((a, b) =>
      a.effectiveDate !== b.effectiveDate
        ? a.effectiveDate < b.effectiveDate ? -1 : 1
        : a.recordedAt < b.recordedAt ? -1 : a.recordedAt > b.recordedAt ? 1 : 0,
    );
  const t = eligible.at(-1);
  if (t) return t;
  return {
    id: "plan",
    effectiveDate: PLAN_TARGETS.effectiveDate,
    kcal: PLAN_TARGETS.kcal,
    protein: PLAN_TARGETS.protein,
    carbs: PLAN_TARGETS.carbs,
    fat: PLAN_TARGETS.fat,
    source: "plan",
    reason: "Phase 1 plan",
    recordedAt: "1970-01-01T00:00:00.000Z",
  };
}

export function lastCalorieChange(targets: Targets[], before: string): Targets | null {
  const changes = targets
    .filter((t) => t.source !== "plan" && t.effectiveDate <= before)
    .sort((a, b) => (a.effectiveDate < b.effectiveDate ? -1 : a.effectiveDate > b.effectiveDate ? 1 : 0));
  return changes.at(-1) ?? null;
}

export type Phase2State = { reached: boolean; avg: number | null };

export function rateBand(avgKg: number, phase2: boolean, rules: RuleSet): { low: number; high: number; pct: [number, number] } {
  const pct = phase2 ? rules.nutrition.phase2RatePct : rules.nutrition.phase1RatePct;
  return { low: r2((avgKg * pct[0]) / 100), high: r2((avgKg * pct[1]) / 100), pct };
}

export interface CalorieChange {
  carbsDelta: number;
  kcalDelta: number;
  rule: string;
  reason: string;
}

export interface WeeklyReview {
  kind: "weekly";
  date: string;
  status: "change" | "hold" | "blocked" | "insufficient" | "cooldown" | "not_started";
  weeks: { start: string; avg: number | null; n: number }[];
  twoWeekGain: number | null;
  weeklyGain: number | null;
  band: { low: number; high: number; pct: [number, number] } | null;
  waist: { date: string; cm: number } | null;
  change: CalorieChange | null;
  rules: string[];
  summary: string;
}

function latestWaist(measurements: Measurement[], from: string, to: string) {
  const w = measurements
    .filter((m) => m.kind === "waist" && m.date >= from && m.date <= to)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .at(-1);
  return w ? { date: w.date, cm: w.valueCm } : null;
}

/** Monday review on the three complete weeks before `date`. */
export function weeklyReview(input: {
  date: string;
  weighIns: WeighIn[];
  measurements: Measurement[];
  targets: Targets[];
  phase2: boolean;
  rules: RuleSet;
}): WeeklyReview {
  const { date, rules } = input;
  const n = rules.nutrition;
  const monday = weekStart(date);
  const weeks = [7, 14, 21].map((k) => {
    const start = addDays(monday, -k);
    const a = averageOver(input.weighIns, start, addDays(start, 6));
    return { start, avg: a.avg, n: a.n };
  });
  const waist = latestWaist(input.measurements, addDays(date, -n.waistMaxAgeDays), date);
  const base = { kind: "weekly" as const, date, weeks, waist, change: null };

  if (weeks[2].start < BASELINE_WEEK_START) {
    return {
      ...base,
      status: "not_started",
      twoWeekGain: null,
      weeklyGain: null,
      band: null,
      rules: ["N6"],
      summary: "Calorie reviews start once three full weeks after the ramp-in are logged (from Mon 12 Oct).",
    };
  }
  const thin = weeks.filter((w) => w.n < n.minReadingsPerWeek);
  if (thin.length) {
    return {
      ...base,
      status: "insufficient",
      twoWeekGain: null,
      weeklyGain: null,
      band: null,
      rules: ["N6", "M1"],
      summary: `Not enough weigh-ins: ${thin.map((w) => `week of ${fmtShort(w.start)} has ${w.n}`).join(", ")} (need ${n.minReadingsPerWeek}). Calories stay put.`,
    };
  }
  const [w1, w2, w3] = weeks.map((w) => w.avg as number);
  const twoWeekGain = r2(w1 - w3);
  const weeklyGain = r2(w1 - w2);
  const band = rateBand(w1, input.phase2, rules);
  const common = { ...base, twoWeekGain, weeklyGain, band };

  if (!waist) {
    return {
      ...common,
      status: "blocked",
      rules: ["N6"],
      summary: "No waist reading this week. The calorie rules can't run without it, so nothing changes.",
    };
  }
  const last = lastCalorieChange(input.targets, date);
  if (last && diffDays(date, last.effectiveDate) < n.cooldownDays) {
    return {
      ...common,
      status: "cooldown",
      rules: ["N6"],
      summary: `Calories changed on ${fmtShort(last.effectiveDate)}. The next change waits until ${fmtShort(addDays(last.effectiveDate, n.cooldownDays))}.`,
    };
  }
  if (twoWeekGain < n.flatTwoWeekGainKg) {
    const change: CalorieChange = {
      carbsDelta: n.carbStepG,
      kcalDelta: n.carbStepG * n.kcalPerCarbG,
      rule: "N1",
      reason: `Weight average moved ${fmtSigned(twoWeekGain)} kg over two weeks (${w3.toFixed(2)} → ${w1.toFixed(2)}). That is flat.`,
    };
    return { ...common, status: "change", change, rules: ["N1"], summary: change.reason };
  }
  const where = weeklyGain < band.low ? "under" : weeklyGain > band.high ? "over" : "inside";
  return {
    ...common,
    status: "hold",
    rules: ["N1", "N6"],
    summary: `Average ${w1.toFixed(2)} kg, ${fmtSigned(weeklyGain)} kg this week, ${where} the ${band.low.toFixed(2)}–${band.high.toFixed(2)} target. Calories stay.`,
  };
}

export interface LiftTrend {
  up: boolean;
  flat: boolean;
  detail: string;
}

export interface MonthlyAudit {
  kind: "monthly";
  date: string;
  status: "change" | "hold" | "blocked" | "insufficient" | "cooldown" | "not_started";
  monthlyGain: number | null;
  waistDelta: number | null;
  ratio: number | null;
  lifts: LiftTrend | null;
  outcomes: { rule: string; text: string }[];
  change: CalorieChange | null;
  summary: string;
}

/** First-week-of-the-month audit: weight, waist and lifts over four weeks. */
export function monthlyAudit(input: {
  date: string;
  weighIns: WeighIn[];
  measurements: Measurement[];
  targets: Targets[];
  lifts: LiftTrend | null;
  rules: RuleSet;
}): MonthlyAudit {
  const { date, rules } = input;
  const n = rules.nutrition;
  const monday = weekStart(date);
  const recentStart = addDays(monday, -7);
  const oldStart = addDays(monday, -35);
  const base = { kind: "monthly" as const, date, lifts: input.lifts, change: null };

  if (oldStart < BASELINE_WEEK_START) {
    return {
      ...base,
      status: "not_started",
      monthlyGain: null,
      waistDelta: null,
      ratio: null,
      outcomes: [],
      summary: "The first monthly audit needs four full weeks after the ramp-in (first run Mon 2 Nov).",
    };
  }
  const recent = averageOver(input.weighIns, recentStart, addDays(recentStart, 6));
  const old = averageOver(input.weighIns, oldStart, addDays(oldStart, 6));
  if (recent.n < n.minReadingsPerWeek || old.n < n.minReadingsPerWeek) {
    return {
      ...base,
      status: "insufficient",
      monthlyGain: null,
      waistDelta: null,
      ratio: null,
      outcomes: [],
      summary: "Not enough weigh-ins at one end of the month to compare. Nothing changes.",
    };
  }
  const waistNow = latestWaist(input.measurements, addDays(date, -n.waistMaxAgeDays), date);
  const waistThen = latestWaist(input.measurements, addDays(date, -35), addDays(date, -21));
  const monthlyGain = r2((recent.avg as number) - (old.avg as number));
  if (!waistNow || !waistThen) {
    return {
      ...base,
      status: "blocked",
      monthlyGain,
      waistDelta: null,
      ratio: null,
      outcomes: [{ rule: "N6", text: "Waist readings missing at one end of the month." }],
      summary: "The audit needs this week's waist and one from about four weeks ago. Nothing changes.",
    };
  }
  const waistDelta = Math.round((waistNow.cm - waistThen.cm) * 10) / 10;
  const ratio = monthlyGain > 0 ? Math.round((waistDelta / monthlyGain) * 100) / 100 : null;
  const outcomes: { rule: string; text: string }[] = [];
  let cut = false;

  if (monthlyGain > 0 && waistDelta > n.waistCutCmPerMonth) {
    cut = true;
    outcomes.push({ rule: "N2", text: `Waist +${waistDelta} cm while weight climbed ${fmtSigned(monthlyGain)} kg: the surplus is too big.` });
  }
  if (ratio !== null && monthlyGain >= n.ratioMinGainKg) {
    if (ratio >= n.ratioCutCmPerKg) {
      if (!cut) outcomes.push({ rule: "N3", text: `Waist grew ${ratio} cm per kg gained, close to 1:1. Gaining too fast.` });
      cut = true;
    } else if (ratio > n.ratioWarnCmPerKg) {
      outcomes.push({ rule: "N3", text: `Waist grew ${ratio} cm per kg gained, above the 0.5 limit. Watch it.` });
    }
  }
  const [pLo, pHi] = n.perfectMonthlyGainKg;
  if (!cut && monthlyGain >= pLo && monthlyGain <= pHi && waistDelta <= n.perfectWaistMaxCm && input.lifts?.up) {
    outcomes.push({ rule: "N4", text: "Weight, waist and lifts all on plan. Change nothing." });
  }
  if (monthlyGain > 0 && input.lifts?.flat) {
    outcomes.push({ rule: "N5", text: `Weight is up but lifts have been flat for ${n.liftsFlatWeeks}+ weeks. Not a food problem: audit sleep, then training.` });
  }

  if (cut) {
    const last = lastCalorieChange(input.targets, date);
    if (last && diffDays(date, last.effectiveDate) < n.cooldownDays) {
      return {
        ...base,
        status: "cooldown",
        monthlyGain,
        waistDelta,
        ratio,
        outcomes,
        summary: `The audit calls for a cut, but calories changed on ${fmtShort(last.effectiveDate)}. It waits for the next review.`,
      };
    }
    const carbsDelta = -n.cutKcal / n.kcalPerCarbG;
    const change: CalorieChange = {
      carbsDelta,
      kcalDelta: -n.cutKcal,
      rule: outcomes.find((o) => o.rule === "N2") ? "N2" : "N3",
      reason: outcomes.find((o) => o.rule === "N2" || o.rule === "N3")!.text,
    };
    return { ...base, status: "change", monthlyGain, waistDelta, ratio, outcomes, change, summary: change.reason };
  }
  return {
    ...base,
    status: "hold",
    monthlyGain,
    waistDelta,
    ratio,
    outcomes,
    summary: outcomes.length ? outcomes.map((o) => o.text).join(" ") : `Weight ${fmtSigned(monthlyGain)} kg and waist ${fmtSigned(waistDelta)} cm this month. Nothing to change.`,
  };
}

export function applyChange(t: Targets, change: CalorieChange): { kcal: number; protein: number; carbs: number; fat: number } {
  return {
    kcal: Math.round(t.kcal + change.kcalDelta),
    protein: t.protein,
    carbs: Math.round((t.carbs + change.carbsDelta) * 10) / 10,
    fat: t.fat,
  };
}

export function fmtSigned(x: number, digits = 2): string {
  const v = x.toFixed(digits);
  return x > 0 ? `+${v}` : x < 0 ? `−${Math.abs(x).toFixed(digits)}` : v;
}

// ---------------------------------------------------------------------------
// Daily feedback from the evening totals
// ---------------------------------------------------------------------------

export interface FeedbackLine {
  tone: "good" | "warn" | "info";
  text: string;
}

export function dailyFeedback(day: NutritionDay | null, target: Targets, rules: RuleSet): FeedbackLine[] {
  if (!day) return [{ tone: "info", text: "No Cronometer totals logged for that day." }];
  const tol = rules.nutrition.feedbackTolerance;
  const out: FeedbackLine[] = [];
  const kcalPct = day.kcal / target.kcal;
  if (Math.abs(kcalPct - 1) <= tol) {
    out.push({ tone: "good", text: `Calories ${fmtInt(day.kcal)} of ${fmtInt(target.kcal)} (${Math.round(kcalPct * 100)}%). On target.` });
  } else if (kcalPct < 1) {
    out.push({ tone: "warn", text: `Calories ${fmtInt(day.kcal)} of ${fmtInt(target.kcal)}: ${fmtInt(target.kcal - day.kcal)} short. The surplus is the whole point of Phase 1.` });
  } else {
    out.push({ tone: "warn", text: `Calories ${fmtInt(day.kcal)} of ${fmtInt(target.kcal)}: ${fmtInt(day.kcal - target.kcal)} over.` });
  }
  if (day.protein >= target.protein * (1 - tol)) {
    out.push({ tone: "good", text: `Protein ${Math.round(day.protein)} of ${target.protein} g.` });
  } else {
    const short = Math.round(target.protein - day.protein);
    const whey = FOODS.find((f) => f.key === "whey")!;
    out.push({ tone: "warn", text: `Protein ${Math.round(day.protein)} of ${target.protein} g: ${short} g short. One scoop of whey is ${whey.protein} g.` });
  }
  if (day.fat > target.fat * (1 + tol)) {
    out.push({ tone: "warn", text: `Fat ${Math.round(day.fat)} of ${target.fat} g. Paneer and mutton are the usual traps (100 g paneer is 20 g fat).` });
  }
  if (day.carbs < target.carbs * (1 - tol)) {
    const rice = FOODS.find((f) => f.key === "rice")!;
    out.push({ tone: "warn", text: `Carbs ${Math.round(day.carbs)} of ${target.carbs} g: ${Math.round(target.carbs - day.carbs)} g short. 100 g raw rice is ${rice.carbs} g.` });
  }
  const computed = day.protein * 4 + day.carbs * 4 + day.fat * 9;
  if (day.kcal > 0 && Math.abs(computed - day.kcal) / day.kcal > 0.15) {
    out.push({ tone: "info", text: `The macros add up to about ${fmtInt(computed)} kcal, not ${fmtInt(day.kcal)}. Worth a second look at the Cronometer totals.` });
  }
  return out;
}

/** Plain-code notes on a meal line he chose to add. No judgement beyond the plan's library. */
export function mealLineNotes(line: string): FeedbackLine[] {
  const foods = matchFoods(line);
  if (!foods.length) return [];
  return foods.map((f) => {
    const kcal = kcalOf(f);
    const facts = f.protein === null ? "" : `${f.unit}: ${f.protein} P / ${f.carbs} C / ${f.fat} F${kcal !== null ? ` ≈ ${kcal} kcal` : ""}.`;
    return { tone: f.tip && /trap/i.test(f.tip) ? "warn" : "info", text: `${f.name}${facts ? ` — ${facts}` : "."}${f.tip ? ` ${f.tip}` : ""}` };
  });
}

function fmtInt(x: number): string {
  return Math.round(x).toLocaleString("en-US");
}

export function averageNutrition(days: NutritionDay[], from: string, to: string) {
  const inRange = days.filter((d) => d.date >= from && d.date <= to);
  if (!inRange.length) return null;
  const mean = (k: "kcal" | "protein" | "carbs" | "fat") => Math.round(inRange.reduce((a, d) => a + d[k], 0) / inRange.length);
  return { n: inRange.length, kcal: mean("kcal"), protein: mean("protein"), carbs: mean("carbs"), fat: mean("fat") };
}
