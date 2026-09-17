import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { bucketOf, listTasks, type Bucket } from "@/lib/modules/tasks";
import { doneDatesByHabit, habitStreak, isScheduled, listHabits } from "@/lib/modules/habits";
import { addDays, dateRange, fmtShort, fmtWeekdayShort, localDate, now, weekday } from "@/lib/time";
import { archiveHabitAction, toggleHabitDayAction } from "@/app/actions/modules";
import { Header } from "@/components/Header";
import { Icon } from "@/components/Icon";
import { TaskRow } from "@/components/TaskRow";
import { AddTaskForm, HabitForm } from "./PlanForms";

export const metadata: Metadata = { title: "Plan" };
export const dynamic = "force-dynamic";

const VIEWS: { key: Bucket; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "someday", label: "Someday" },
  { key: "done", label: "Done" },
];

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const user = await requireUser();
  const db = await getDb();
  const today = localDate(now());
  const { view: asked } = await searchParams;
  const view: Bucket = VIEWS.some((v) => v.key === asked) ? (asked as Bucket) : "today";

  const [tasks, habits] = await Promise.all([listTasks(db, user.id), listHabits(db, user.id)]);
  const counts = Object.fromEntries(VIEWS.map((v) => [v.key, tasks.filter((t) => bucketOf(t, today) === v.key).length])) as Record<Bucket, number>;
  let shown = tasks.filter((t) => bucketOf(t, today) === view);
  if (view === "done") shown = shown.sort((a, b) => ((a.doneAt ?? "") < (b.doneAt ?? "") ? 1 : -1)).slice(0, 40);

  const earliest = habits.reduce((m, h) => (localDate(new Date(h.createdAt)) < m ? localDate(new Date(h.createdAt)) : m), today);
  const logs = await doneDatesByHabit(db, user.id, earliest < addDays(today, -400) ? addDays(today, -400) : earliest, today);
  const week = dateRange(addDays(today, -6), today);

  return (
    <main id="main" className="scr">
      <Header chip={fmtShort(today)} />
      <div className="row">
        <div className="hd">
          <div className="eyebrow">Tasks · habits · goals</div>
          <h1 className="h1">Plan</h1>
        </div>
        <Link href="/plan/goals" className="chip">
          <Icon name="target" size={13} /> Goals
        </Link>
      </div>

      <nav className="seg" aria-label="Task lists">
        {VIEWS.map((v) => (
          <Link key={v.key} href={v.key === "today" ? "/plan" : `/plan?view=${v.key}`} aria-current={view === v.key ? "page" : undefined}>
            {v.label}
            {counts[v.key] ? ` ${counts[v.key]}` : ""}
          </Link>
        ))}
      </nav>

      <AddTaskForm today={today} defaultDue={view === "today" ? today : view === "upcoming" ? addDays(today, 1) : ""} />

      <section className="card flush" aria-label={`${VIEWS.find((v) => v.key === view)!.label} tasks`}>
        {shown.length ? (
          shown.map((t) => <TaskRow key={t.id} task={t} today={today} />)
        ) : (
          <p className="sm t3" style={{ padding: "12px 0" }}>
            {view === "today" ? "Nothing due today or overdue." : view === "upcoming" ? "Nothing scheduled ahead." : view === "someday" ? "No undated tasks." : "Nothing finished yet."}
          </p>
        )}
      </section>

      <div className="sec" id="habits">
        Habits <span>{fmtShort(week[0])} to today</span>
      </div>
      <section className="card flush" aria-label="Habits">
        {habits.length ? (
          habits.map((h) => {
            const done = logs.get(h.id) ?? new Set<string>();
            const streak = habitStreak(h, done, today);
            return (
              <div key={h.id} className="habit">
                <div className="row">
                  <span className="tt">{h.name}</span>
                  <span className="chip" title={`Best: ${streak.best}`}>
                    <Icon name="flame" size={12} /> {streak.current} {streak.current === 1 ? "day" : "days"}
                  </span>
                </div>
                <div className="wk">
                  {week.map((d) => {
                    const on = done.has(d);
                    const scheduled = isScheduled(h, d);
                    return (
                      <form key={d} action={toggleHabitDayAction}>
                        <input type="hidden" name="habitId" value={h.id} />
                        <input type="hidden" name="date" value={d} />
                        <input type="hidden" name="done" value={on ? "0" : "1"} />
                        <button
                          type="submit"
                          className={`${on ? "on" : ""}${d === today ? " today" : ""}${scheduled ? "" : " off"}`}
                          aria-pressed={on}
                          aria-label={`${h.name}, ${fmtShort(d)}: ${on ? "done" : "not done"}${scheduled ? "" : " (not scheduled)"}`}
                          style={{ width: "100%" }}
                        >
                          {on ? <Icon name="check" size={14} stroke={3} /> : fmtWeekdayShort(weekday(d)).slice(0, 1)}
                        </button>
                      </form>
                    );
                  })}
                </div>
                <details className="more">
                  <summary>Edit</summary>
                  <HabitForm habit={{ id: h.id, name: h.name, days: h.days }} />
                  <form action={archiveHabitAction} style={{ marginTop: 8 }}>
                    <input type="hidden" name="id" value={h.id} />
                    <button type="submit" className="btn ghost small">
                      Archive habit
                    </button>
                  </form>
                </details>
              </div>
            );
          })
        ) : (
          <p className="sm t3" style={{ padding: "12px 0" }}>
            No habits yet. Streaks count only the days a habit is scheduled.
          </p>
        )}
      </section>
      <details className="more">
        <summary>New habit</summary>
        <HabitForm habit={null} />
      </details>
    </main>
  );
}
