import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { fitnessBasics } from "@/lib/views/fitness";
import { goalProgress, listGoals, nextMilestone } from "@/lib/modules/goals";
import { sevenDayAverage } from "@/lib/fitness/nutrition";
import { addMilestoneAction, deleteMilestoneAction, goalStatusAction, toggleMilestoneAction } from "@/app/actions/modules";
import { fmtShort, now } from "@/lib/time";
import { Header } from "@/components/Header";
import { Icon } from "@/components/Icon";
import { GoalCreateForm, GoalEditForm } from "./GoalForms";

export const metadata: Metadata = { title: "Goals" };
export const dynamic = "force-dynamic";

export default async function GoalsPage({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const user = await requireUser();
  const { archived } = await searchParams;
  const showArchived = archived === "1";
  const [v, allGoals] = await Promise.all([fitnessBasics(user.id, now()), getDb().then((db) => listGoals(db, user.id, showArchived))]);
  const goals = allGoals.filter((g) => (showArchived ? !!g.archivedAt : !g.archivedAt));
  const metrics = {
    benchE1rm: v.bests.bench?.best?.e1rm ?? null,
    bodyweightAvg: sevenDayAverage(v.weighIns, v.today).avg,
  };

  return (
    <main id="main" className="scr">
      <Header chip={fmtShort(v.today)} />
      <div className="row">
        <div className="hd">
          <div className="eyebrow">{goals.length} {showArchived ? "archived" : "active"}</div>
          <h1 className="h1">Goals</h1>
        </div>
        <Link href="/plan" className="chip">
          <Icon name="back" size={13} /> Plan
        </Link>
      </div>

      {goals.map((g) => {
        const p = goalProgress(g, metrics);
        const next = nextMilestone(g);
        return (
          <section key={g.id} className="card" aria-labelledby={`g-${g.id}`}>
            <div className="row start">
              <div>
                <div className="eyebrow">{g.category}</div>
                <h2 id={`g-${g.id}`} className="exname" style={{ fontSize: 20 }}>
                  {g.title}
                </h2>
              </div>
              <span className="chip">{g.targetDate ? fmtShort(g.targetDate) : "No date"}</span>
            </div>
            <div className={`meter${p.pct >= 100 || g.achievedAt ? " good" : ""}`} role="progressbar" aria-valuenow={p.pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${g.title} progress`}>
              <i style={{ width: `${p.pct}%` }} />
            </div>
            <div className="row sm">
              <span className="t3">{p.label}</span>
              <b className="num">{p.pct}%</b>
            </div>
            <div className="row">
              <span className="sm t2">
                {g.achievedAt ? "Achieved." : g.kind === "auto" ? (g.metric === "bench_e1rm" ? "Updates from your bench sets." : "Updates from your weigh-ins.") : next ? `Next: ${next.title}` : g.milestones.length ? "All milestones done." : "Add milestones below."}
              </span>
              {g.kind === "auto" ? (
                <span className="chip">
                  <Icon name="bolt" size={11} stroke={2} /> Auto
                </span>
              ) : null}
            </div>
            {g.notes ? <p className="sm t3">{g.notes}</p> : null}
            {g.kind === "manual" ? (
              <div className="list">
                {g.milestones.map((m) => (
                  <div key={m.id} className={`it${m.doneAt ? " done" : ""}`}>
                    <form action={toggleMilestoneAction}>
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="done" value={m.doneAt ? "0" : "1"} />
                      <button type="submit" className={`box${m.doneAt ? " on" : ""}`} aria-pressed={!!m.doneAt} aria-label={`${m.title}: ${m.doneAt ? "done" : "not done"}`}>
                        {m.doneAt ? <Icon name="check" size={16} stroke={3} /> : null}
                      </button>
                    </form>
                    <span className="tt">{m.title}</span>
                    <form action={deleteMilestoneAction}>
                      <input type="hidden" name="id" value={m.id} />
                      <button type="submit" className="iconbtn danger" aria-label={`Delete milestone ${m.title}`} style={{ width: 32, height: 32 }}>
                        <Icon name="close" size={14} />
                      </button>
                    </form>
                  </div>
                ))}
                <form action={addMilestoneAction} className="row" style={{ paddingTop: 8 }}>
                  <input type="hidden" name="goalId" value={g.id} />
                  <label className="grow">
                    <span className="sr-only">New milestone for {g.title}</span>
                    <input className="input" name="title" placeholder="Add a milestone" maxLength={200} required />
                  </label>
                  <button type="submit" className="btn inline small" aria-label={`Add milestone to ${g.title}`}>
                    +
                  </button>
                </form>
              </div>
            ) : null}
            <details className="more">
              <summary>Edit or archive</summary>
              <GoalEditForm goal={{ id: g.id, title: g.title, category: g.category, targetDate: g.targetDate, notes: g.notes, kind: g.kind, targetValue: g.targetValue }} />
              <div className="btn-row" style={{ marginTop: 8 }}>
                <form action={goalStatusAction}>
                  <input type="hidden" name="id" value={g.id} />
                  <input type="hidden" name="op" value={g.achievedAt ? "unachieve" : "achieve"} />
                  <button type="submit" className="btn ghost small" style={{ width: "100%" }}>
                    {g.achievedAt ? "Not achieved" : "Mark achieved"}
                  </button>
                </form>
                <form action={goalStatusAction}>
                  <input type="hidden" name="id" value={g.id} />
                  <input type="hidden" name="op" value={g.archivedAt ? "restore" : "archive"} />
                  <button type="submit" className="btn ghost small" style={{ width: "100%" }}>
                    {g.archivedAt ? "Restore" : "Archive"}
                  </button>
                </form>
              </div>
            </details>
          </section>
        );
      })}
      {goals.length === 0 ? <p className="empty">{showArchived ? "No archived goals." : "No goals yet."}</p> : null}

      <details className="more" open={goals.length === 0 && !showArchived}>
        <summary>New goal</summary>
        <GoalCreateForm />
      </details>
      <p className="sm t3">Auto goals update from your logs. The others move when you tick a milestone. Deadlines show on the calendar.</p>
      <Link href={showArchived ? "/plan/goals" : "/plan/goals?archived=1"} className="link">
        {showArchived ? "Back to active goals" : "Archived goals"}
      </Link>
    </main>
  );
}
