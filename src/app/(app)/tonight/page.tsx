import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { loadNutrition, loadTargets } from "@/lib/fitness/repo";
import { averageNutrition, targetOn } from "@/lib/fitness/nutrition";
import { addDays, fmtShort, logicalDate, now } from "@/lib/time";
import { fmtInt } from "@/lib/format";
import { fmtKg } from "@/lib/fitness/equipment";
import { Header } from "@/components/Header";
import { TonightForm } from "./TonightForm";

export const metadata: Metadata = { title: "Tonight" };
export const dynamic = "force-dynamic";

export default async function TonightPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const user = await requireUser();
  const db = await getDb();
  const night = logicalDate(now());
  const { date: asked } = await searchParams;
  const date = asked && asked <= night && asked >= addDays(night, -30) ? asked : night;
  const [days, targets] = await Promise.all([loadNutrition(db, user.id), loadTargets(db, user.id)]);
  const existing = days.find((d) => d.date === date) ?? null;
  const target = targetOn(targets, date);
  const week = averageNutrition(days, addDays(night, -6), night);
  const yesterday = addDays(night, -1);
  const yesterdayMissing = !days.some((d) => d.date === yesterday);

  return (
    <main id="main" className="scr">
      <Header chip={fmtShort(date)} />
      <div className="hd">
        <div className="eyebrow">End of day · from Cronometer</div>
        <h1 className="h1">Tonight</h1>
        <p className="sub">
          Four totals, not meals. Targets for {fmtShort(date)}: {fmtInt(target.kcal)} kcal · {target.protein} P · {fmtKg(target.carbs)} C · {target.fat} F.
        </p>
      </div>
      <nav className="seg" aria-label="Which day">
        <Link href="/tonight" aria-current={date === night ? "page" : undefined}>
          {fmtShort(night)}
        </Link>
        <Link href={`/tonight?date=${yesterday}`} aria-current={date === yesterday ? "page" : undefined}>
          {fmtShort(yesterday)}
          {yesterdayMissing ? " · missing" : ""}
        </Link>
      </nav>
      <TonightForm
        key={date}
        date={date}
        initial={existing ? { kcal: existing.kcal, protein: existing.protein, carbs: existing.carbs, fat: existing.fat, note: existing.note } : null}
        target={{ kcal: target.kcal, protein: target.protein, carbs: target.carbs, fat: target.fat }}
      />
      {week ? (
        <section className="card" aria-label="Last 7 days">
          <div className="row">
            <span className="lbl">Last 7 days · {week.n} logged</span>
            <span className="sm t2">average</span>
          </div>
          <div className="st-grid four">
            <div>
              <span className="lbl">Kcal</span>
              <b>{fmtInt(week.kcal)}</b>
            </div>
            <div>
              <span className="lbl">P</span>
              <b>{week.protein}</b>
            </div>
            <div>
              <span className="lbl">C</span>
              <b>{week.carbs}</b>
            </div>
            <div>
              <span className="lbl">F</span>
              <b>{week.fat}</b>
            </div>
          </div>
          <p className="sm t3">Calories only change through the Monday review, on weekly averages. One day never moves anything.</p>
        </section>
      ) : null}
    </main>
  );
}
