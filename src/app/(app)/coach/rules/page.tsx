import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { CURRENT_RULES, RULE_TEXT } from "@/lib/fitness/rules";
import { PROGRAM_VERSION } from "@/lib/fitness/program";
import { fmtDuration } from "@/lib/time";
import { Header } from "@/components/Header";
import { TrainNav } from "@/components/TrainNav";

export const metadata: Metadata = { title: "Rules" };

export default async function RulesPage() {
  await requireUser();
  const r = CURRENT_RULES;
  const n = r.nutrition;
  const numbers: [string, string][] = [
    ["Deload", `after ${r.progression.missesBeforeDeload} misses in a row, −${r.progression.deloadFraction * 100}%`],
    ["No best-set attempt after a deload", `${r.progression.prWindowAfterDeloadDays} days`],
    ["Baseline test", `${r.baseline.testReps} reps, assumed ${r.baseline.assumedRir} in reserve`],
    ["Deadlift entry", `${r.baseline.deadliftFractionOfRdl * 100}% of the 8-rep RDL`],
    ["Readiness: sleep", `≥ ${fmtDuration(r.readiness.minSleepMinutes)} (placeholder until ~6 weeks of data)`],
    ["Readiness: food", `≥ ${r.readiness.minKcalFraction * 100}% of yesterday's calories (placeholder)`],
    ["Flat weight", `2-week gain under ${n.flatTwoWeekGainKg} kg → +${n.carbStepG} g carbs`],
    ["Readings per week", `at least ${n.minReadingsPerWeek}`],
    ["Between calorie changes", `${n.cooldownDays} days`],
    ["Waist cut", `> ${n.waistCutCmPerMonth} cm a month with weight climbing → −${n.cutKcal} kcal`],
    ["Waist ratio", `warn above ${n.ratioWarnCmPerKg} cm/kg, cut at ${n.ratioCutCmPerKg} cm/kg`],
    ["Perfect month", `+${n.perfectMonthlyGainKg[0]}–${n.perfectMonthlyGainKg[1]} kg, waist ≤ +${n.perfectWaistMaxCm} cm, lifts up`],
    ["Lifts flat", `${n.liftsFlatWeeks}+ weeks`],
    ["Phase 2", `at a ${n.phase2AtKg} kg average; rate ${n.phase2RatePct[0]}–${n.phase2RatePct[1]}% a week (Phase 1: ${n.phase1RatePct[0]}–${n.phase1RatePct[1]}%)`],
    ["Bests", `sets of ${r.bests.minReps}–${r.bests.maxReps} reps`],
  ];
  return (
    <main id="main" className="scr">
      <Header chip={`Rules ${r.version}`} />
      <TrainNav current="/coach" />
      <div className="hd">
        <div className="eyebrow">
          Rules {r.version} · program {PROGRAM_VERSION}
        </div>
        <h1 className="h1">Rules</h1>
        <p className="sub">
          The coach works only inside these. Changing a number makes a new version; old versions stay so past prescriptions can be replayed.
        </p>
      </div>
      <section className="card flush" aria-label="Rule list">
        {Object.entries(RULE_TEXT).map(([id, text]) => (
          <div key={id} className="log">
            <span className="when">{id}</span>
            <div className="because" style={{ color: "var(--ink)" }}>
              {text}
            </div>
          </div>
        ))}
      </section>
      <div className="sec">Numbers in {r.version}</div>
      <section className="card">
        <table className="tbl">
          <tbody>
            {numbers.map(([k, v]) => (
              <tr key={k}>
                <td>{k}</td>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
