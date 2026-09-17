// The coach's note: what changed, why, and what comes next. Written from the
// same numbers the rules produced, never the other way round.
import { fmtShort, weekday } from "@/lib/time";
import { bestEventText, type BestEvent, type LiftBests } from "./bests";
import { headlineSlot, loadText, repRangeText, type Card } from "./card";
import { fmtKg } from "./equipment";
import type { CalorieChange, FeedbackLine, MonthlyAudit, WeeklyReview } from "./nutrition";
import { BENCH_GOAL_KG } from "./program";
import type { Gate } from "./readiness";

export interface AnnouncedChange {
  id: string;
  kind: "load" | "calories";
  title: string;
  reason: string;
  rule: string;
  effective: string | null;
  track: string | null;
  from: number | null;
  to: number | null;
  cited: string[];
}

export type NoteLineKind = "change" | "nutrition" | "gate" | "missing" | "review" | "best" | "next" | "info";

export interface NoteLine {
  kind: NoteLineKind;
  text: string;
  rule?: string;
  tone?: "good" | "warn" | "info";
}

export interface CoachNote {
  number: string;
  headline: string;
  lines: NoteLine[];
}

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function effectiveLabel(effective: string | null, today: string): string {
  if (!effective) return "";
  if (effective === today) return "tonight";
  return `on ${DOW[weekday(effective) - 1]} ${fmtShort(effective).split(" ").slice(1).join(" ")}`;
}

export function composeNote(input: {
  date: string;
  card: Card;
  gate: Gate;
  changes: AnnouncedChange[];
  calorieChange: CalorieChange | null;
  weekly: WeeklyReview | null;
  monthly: MonthlyAudit | null;
  feedback: FeedbackLine[];
  missing: string[];
  bestEvents: BestEvent[];
  bests: Record<string, LiftBests>;
  sevenDayAvg: number | null;
  weeklyChange: number | null;
  phase2Reached: boolean;
  replayDue: boolean;
}): CoachNote {
  const lines: NoteLine[] = [];
  const { card } = input;

  let headline: string;
  if (card.kind === "rest") {
    headline = card.restReason ?? "Rest day.";
  } else if (card.phase === "rampin") {
    headline = `${card.session!.name} tonight if it's a trainer day: light sets, stopping 4–5 reps short.`;
  } else if (card.phase === "baseline" && card.slots.some((s) => s.status === "baseline_test")) {
    headline = `${card.session!.name} tonight: 8-rep baseline tests on the main lifts, then the rest of the session.`;
  } else {
    const h = headlineSlot(card);
    const lift = h && h.weight !== null ? ` ${h.label.replace(/^Barbell /, "")} ${loadText(h)} × ${repRangeText(h.reps)}.` : "";
    headline = `${card.session!.name} tonight, ${card.session!.focus.toLowerCase()}.${lift}`;
  }

  for (const c of input.changes) {
    lines.push({ kind: "change", text: `${c.title}${c.effective ? ` ${effectiveLabel(c.effective, input.date)}` : ""}. ${c.reason}`, rule: c.rule });
  }

  if (card.kind === "train" && card.phase !== "rampin" && card.phase !== "baseline") {
    lines.push({
      kind: "gate",
      text: input.gate.open
        ? `Best-set attempt is on. ${input.gate.reasons.join(" ")} On the last set of your first lift, take the planned load for every clean rep you have.`
        : input.gate.status === "missing"
          ? input.gate.reasons.join(" ")
          : `Best-set attempt is off. ${input.gate.reasons.join(" ")} Run the planned loads.`,
      rule: input.gate.rules.join(", "),
      tone: input.gate.open ? "good" : "info",
    });
  }

  if (input.weekly && input.weekly.status !== "not_started") {
    lines.push({ kind: "review", text: `Weekly review: ${input.weekly.summary}`, rule: input.weekly.rules.join(", ") });
  }
  if (input.monthly && input.monthly.status !== "not_started") {
    lines.push({ kind: "review", text: `Monthly audit: ${input.monthly.summary}`, rule: input.monthly.outcomes.map((o) => o.rule).join(", ") || "N6" });
  }
  if (input.replayDue) {
    lines.push({ kind: "info", text: "Monthly replay test ran: every past prescription was recomputed from the log. See Coach → Audit." });
  }

  // Missing totals are already in the missing list; only real totals get feedback.
  const logged = input.feedback.filter((f) => f.tone !== "info" || !f.text.startsWith("No Cronometer totals"));
  const warn = logged.filter((f) => f.tone === "warn");
  const shown = warn.length ? warn.slice(0, 2) : logged.slice(0, 1);
  for (const f of shown) lines.push({ kind: "nutrition", text: `Yesterday: ${f.text}`, tone: f.tone });

  for (const ev of input.bestEvents.slice(0, 3)) lines.push({ kind: "best", text: bestEventText(ev), tone: "good" });

  for (const m of input.missing) lines.push({ kind: "missing", text: m, rule: "M1", tone: "warn" });

  if (input.phase2Reached) {
    lines.push({ kind: "info", text: "Your 7-day average is at 65 kg. Phase 2 starts: the target rate drops to 0.25–0.3% a week, and calories need recalculating with your plan.", rule: "N7", tone: "warn" });
  }

  const next: string[] = [];
  const bench = input.bests.bench;
  if (bench?.best) {
    if (bench.peak && !bench.peakPassed) {
      next.push(`Bench estimated max ${fmtKg(bench.best.e1rm)} kg, ${bench.regainPct}% of the way back to your ${fmtKg(bench.peak.e1rm)} kg December peak.`);
    } else {
      next.push(`Bench estimated max ${fmtKg(bench.best.e1rm)} kg on the road to ${BENCH_GOAL_KG}.`);
    }
  }
  if (input.sevenDayAvg !== null) {
    const toGo = Math.max(0, 65 - input.sevenDayAvg);
    next.push(
      `7-day average ${input.sevenDayAvg.toFixed(2)} kg${input.weeklyChange !== null ? ` (${input.weeklyChange >= 0 ? "+" : "−"}${Math.abs(input.weeklyChange).toFixed(2)} on last week)` : ""}${toGo > 0 ? `, ${toGo.toFixed(1)} kg to 65` : ""}.`,
    );
  }
  if (next.length) lines.push({ kind: "next", text: next.join(" ") });

  return {
    number: `Work order ${input.date.slice(5, 7)}${input.date.slice(8, 10)}`,
    headline,
    lines,
  };
}

export function calorieChangeTitle(from: { kcal: number; carbs: number }, to: { kcal: number; carbs: number }): string {
  return `Carbs ${fmtKg(from.carbs)} → ${fmtKg(to.carbs)} g (${from.kcal.toLocaleString("en-US")} → ${to.kcal.toLocaleString("en-US")} kcal)`;
}
