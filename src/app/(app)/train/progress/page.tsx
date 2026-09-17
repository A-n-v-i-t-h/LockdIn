import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { fitnessBasics } from "@/lib/views/fitness";
import { averageNutrition, rateBand, rollingSeries, sevenDayAverage, targetOn } from "@/lib/fitness/nutrition";
import { BASELINE_WEEK_START, BENCH_GOAL_KG, EXERCISES, PEAKS, PROGRAM_START } from "@/lib/fitness/program";
import { fmtKg } from "@/lib/fitness/equipment";
import { CURRENT_RULES } from "@/lib/fitness/rules";
import { addDays, dateRange, fmtShort, now } from "@/lib/time";
import { fmtInt, fmtSignedKg } from "@/lib/format";
import { Header } from "@/components/Header";
import { ScrollX } from "@/components/ScrollX";
import { Icon } from "@/components/Icon";
import { TrainNav } from "@/components/TrainNav";
import { WeightChart } from "@/components/charts/WeightChart";
import { KcalChart } from "@/components/charts/KcalChart";

export const metadata: Metadata = { title: "Progress" };
export const dynamic = "force-dynamic";

export default async function ProgressPage() {
  const user = await requireUser();
  const v = await fitnessBasics(user.id, now());
  const { today, weighIns, nutrition, measurements, targets, bests } = v;

  const firstWeigh = weighIns.find((w) => w.weight !== null)?.date ?? null;
  const from = firstWeigh && firstWeigh < PROGRAM_START ? firstWeigh : PROGRAM_START;
  const series = today >= from ? rollingSeries(weighIns, from, today) : [];
  const avg = sevenDayAverage(weighIns, today);
  const prev = sevenDayAverage(weighIns, addDays(today, -7));
  const weekly = avg.avg !== null && prev.avg !== null ? Math.round((avg.avg - prev.avg) * 100) / 100 : null;
  const phase2 = avg.avg !== null && avg.avg >= CURRENT_RULES.nutrition.phase2AtKg;
  const band = avg.avg !== null ? rateBand(avg.avg, phase2, CURRENT_RULES) : null;
  const firstAvg = series.find((p) => p.avg !== null)?.avg ?? null;
  const onTarget = weekly !== null && band ? weekly >= band.low && weekly <= band.high : null;

  const markers = targets
    .filter((t) => t.source !== "plan")
    .map((t, i, arr) => {
      const before = i > 0 ? arr[i - 1] : targetOn([], t.effectiveDate);
      const d = t.carbs - before.carbs;
      return { date: t.effectiveDate, label: d === 0 ? "targets" : `${d > 0 ? "+" : "−"}${fmtKg(Math.abs(d))} g carbs` };
    });

  const waists = measurements.filter((m) => m.kind === "waist");
  const waistNow = waists.at(-1) ?? null;
  const waistStart = waists.find((m) => m.date >= BASELINE_WEEK_START) ?? waists[0] ?? null;
  const gainSinceWaistStart =
    waistStart && avg.avg !== null ? avg.avg - (sevenDayAverage(weighIns, waistStart.date).avg ?? avg.avg) : null;
  const waistDelta = waistNow && waistStart ? Math.round((waistNow.valueCm - waistStart.valueCm) * 10) / 10 : null;
  const ratio = waistDelta !== null && gainSinceWaistStart !== null && gainSinceWaistStart >= 0.5 ? waistDelta / gainSinceWaistStart : null;

  const last7 = dateRange(addDays(today, -6), today).map((d) => ({
    date: d,
    kcal: nutrition.find((n) => n.date === d)?.kcal ?? null,
    target: targetOn(targets, d).kcal,
  }));
  const week = averageNutrition(nutrition, addDays(today, -6), today);
  const currentTarget = targetOn(targets, today);

  const regain = Object.values(bests).filter((b) => b.peak);
  const bench = bests.bench;
  const benchPct = bench?.best ? Math.min(100, (bench.best.e1rm / BENCH_GOAL_KG) * 100) : 0;
  const others = Object.values(bests)
    .filter((b) => b.best)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <main id="main" className="scr">
      <Header chip={fmtShort(today)} />
      <TrainNav current="/train/progress" />
      <div className="hd">
        <div className="eyebrow">Since {fmtShort(from)} · only logged data</div>
        <h1 className="h1">Progress</h1>
      </div>

      <section className="card" aria-labelledby="w-h">
        <div className="row">
          <span id="w-h" className="lbl">
            Weight · 7-day average
          </span>
          {onTarget === null ? null : onTarget ? (
            <span className="chip good">
              <Icon name="check" size={12} stroke={2.6} /> On target
            </span>
          ) : (
            <span className="chip warn">{weekly! < band!.low ? "Under target" : "Over target"}</span>
          )}
        </div>
        <div>
          <span className="big">{avg.avg === null ? "—" : avg.avg.toFixed(2)}</span>
          <span className="unit">kg</span>
        </div>
        <p className="sm t2">
          {weekly !== null && band
            ? `${fmtSignedKg(weekly)} kg this week against a ${band.low.toFixed(2)}–${band.high.toFixed(2)} target (${band.pct[0]}–${band.pct[1]}% a week, Phase ${phase2 ? 2 : 1}).`
            : "A weekly change needs two weeks of weigh-ins."}
          {firstAvg !== null && avg.avg !== null ? ` ${fmtSignedKg(avg.avg - firstAvg)} kg since ${fmtShort(from)}.` : ""}
        </p>
        <WeightChart points={series} rampInEnd={addDays(BASELINE_WEEK_START, -1)} markers={markers} />
        <div className="lg">
          <span>
            <i className="kl" />
            7-day average
          </span>
          <span>
            <i className="kd" />
            Daily reading
          </span>
          {markers.length ? (
            <span>
              <i className="km" />
              Calorie change
            </span>
          ) : null}
        </div>
        <details className="more">
          <summary>Weekly numbers</summary>
          <table className="tbl">
            <thead>
              <tr>
                <th>Week ending</th>
                <th className="n">Average</th>
                <th className="n">Readings</th>
              </tr>
            </thead>
            <tbody>
              {series
                .filter((p) => p.date >= addDays(from, 6) && new Date(`${p.date}T00:00:00Z`).getUTCDay() === 0)
                .reverse()
                .map((p) => (
                  <tr key={p.date}>
                    <td>{fmtShort(p.date)}</td>
                    <td className="n">{p.avg === null ? "—" : `${p.avg.toFixed(2)} kg`}</td>
                    <td className="n">{p.n}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </details>
      </section>

      <section className="card" aria-labelledby="waist-h">
        <div className="row">
          <span id="waist-h" className="lbl">
            Waist · at navel
          </span>
          {ratio !== null ? (
            ratio <= CURRENT_RULES.nutrition.ratioWarnCmPerKg ? (
              <span className="chip good">
                <Icon name="check" size={12} stroke={2.6} /> Within limit
              </span>
            ) : (
              <span className="chip warn">Above limit</span>
            )
          ) : null}
        </div>
        <div>
          <span className="big">{waistNow ? waistNow.valueCm.toFixed(1) : "—"}</span>
          <span className="unit">cm</span>
        </div>
        <p className="sm t2">
          {waistNow && waistStart && waistDelta !== null
            ? `${fmtSignedKg(waistDelta, 1)} cm since ${fmtShort(waistStart.date)}${gainSinceWaistStart !== null ? ` while the average moved ${fmtSignedKg(gainSinceWaistStart)} kg` : ""}. The limit is 1 cm per 2 kg.`
            : "Measure on Monday mornings, right after weighing. The calorie rules need it."}
        </p>
      </section>

      <section className="card" aria-labelledby="regain-h">
        <span id="regain-h" className="lbl">
          Regain toward your December 2025 peaks
        </span>
        {Object.entries(PEAKS).map(([group, peak]) => {
          const b = regain.find((x) => x.group === group);
          const cur = b?.best?.e1rm ?? null;
          const pctVal = cur ? Math.min(100, Math.round((cur / peak.e1rm) * 100)) : 0;
          return (
            <div key={group} className="mrow">
              <div className="row">
                <span>{group === "bench" ? "Bench press" : "Weighted pull-up"}</span>
                <b>
                  {cur ? fmtKg(cur) : "—"} / {peak.e1rm} kg
                </b>
              </div>
              <div className={`meter${b?.peakPassed ? " good" : ""}`}>
                <i style={{ width: `${pctVal}%` }} />
              </div>
              <span className="sm t3">{b?.peakPassed ? "Peak passed: new bests are PRs." : peak.label}</span>
            </div>
          );
        })}
        <p className="sm t3">Estimated maxes from sets of 6–12 reps. A best only counts as a PR once the old peak is passed.</p>
      </section>

      <section className="card road" aria-labelledby="road-h">
        <div className="row">
          <span id="road-h" className="lbl">
            Road to a 100 kg bench
          </span>
          <span className="sm t2">2028–29</span>
        </div>
        <div className="meter">
          <i style={{ width: `${benchPct}%` }} />
        </div>
        <div className="pins" aria-hidden="true">
          <span style={{ left: "0%" }}>
            start
            <br />0
          </span>
          {bench?.best ? (
            <span style={{ left: `${benchPct}%` }}>
              now
              <br />
              {Math.round(bench.best.e1rm)}
            </span>
          ) : null}
          <span style={{ left: `${PEAKS.bench.e1rm}%` }}>
            old peak
            <br />
            {PEAKS.bench.e1rm}
          </span>
          <span style={{ left: "100%" }}>
            goal
            <br />
            100
          </span>
        </div>
        <p className="sr-only">
          Bench estimated max {bench?.best ? `${fmtKg(bench.best.e1rm)} kg` : "not measured yet"}, old peak {PEAKS.bench.e1rm} kg, goal 100 kg.
        </p>
      </section>

      <section className="card" aria-labelledby="kcal-h">
        <div className="row">
          <span id="kcal-h" className="lbl">
            Calories · last 7 days
          </span>
          <span className="sm t2">{week ? `Average ${fmtInt(week.kcal)} · ${week.n} logged` : "Nothing logged"}</span>
        </div>
        <KcalChart days={last7} />
        <p className="sm t2">
          {week
            ? `Protein averaged ${week.protein} g against ${currentTarget.protein} g. Fat ${week.fat} g against ${currentTarget.fat} g.`
            : "Log the four Cronometer totals each night to fill this in."}
        </p>
      </section>

      <section className="card" aria-labelledby="bests-h">
        <span id="bests-h" className="lbl">
          Bests · 6–12 reps
        </span>
        {others.length ? (
          <ScrollX label="Bests table">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Lift</th>
                  <th className="n">Best set</th>
                  <th className="n">Est. max</th>
                </tr>
              </thead>
              <tbody>
                {others.map((b) => {
                  const ex = EXERCISES[b.best!.exercise];
                  const w = ex?.equipment === "belt" ? `+${fmtKg(b.best!.weight ?? 0)}` : fmtKg(b.best!.weight);
                  return (
                    <tr key={b.group}>
                      <td>{b.name}</td>
                      <td className="n">
                        {w} × {b.best!.reps}
                      </td>
                      <td className="n">{fmtKg(b.best!.e1rm)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollX>
        ) : (
          <p className="sm t3">Bests start counting after the ramp-in, from sets of 6 to 12 reps.</p>
        )}
      </section>

      <Link href="/coach" className="btn ghost">
        What the coach changed →
      </Link>
    </main>
  );
}
