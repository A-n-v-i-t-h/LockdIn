import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { loadDayChanges, loadSettings } from "@/lib/fitness/repo";
import { PHASE_LABEL, weekPlan, weekStart, weekNumber, type DayPlan } from "@/lib/fitness/schedule";
import { moveDayAction, skipDayAction, undoDayChangeAction } from "@/app/actions/fitness";
import { addDays, fmtShort, isIsoDate, localDate, now } from "@/lib/time";
import { pad2 } from "@/lib/format";
import { Header } from "@/components/Header";
import { TrainNav } from "@/components/TrainNav";

export const metadata: Metadata = { title: "This week" };
export const dynamic = "force-dynamic";

const SAVED: Record<string, string> = {
  moved: "Moved. The card and the coach now follow the new week.",
  skipped: "Skipped. Those lifts repeat unchanged next time.",
  undone: "Change undone. The day is back to the plan.",
};

function describe(p: DayPlan): string {
  if (p.kind === "train") return p.session.name + (p.movedFrom ? ` · moved from ${fmtShort(p.movedFrom)}` : "");
  switch (p.reason) {
    case "moved":
      return `Rest · session moved to ${fmtShort(p.movedTo!)}`;
    case "skipped":
      return "Rest · session skipped";
    case "build-rest":
      return "Rest (five-day weeks)";
    case "pre":
      return "Before the program";
    default:
      return "Rest";
  }
}

export default async function WeekPage({ searchParams }: { searchParams: Promise<{ w?: string; saved?: string; error?: string }> }) {
  const user = await requireUser();
  const db = await getDb();
  const today = localDate(now());
  const sp = await searchParams;
  const thisWeek = weekStart(today);
  const minDay = addDays(today, -30);
  const maxDay = addDays(today, 14);
  const asked = sp.w && isIsoDate(sp.w) ? weekStart(sp.w) : thisWeek;
  const monday = asked < weekStart(minDay) ? weekStart(minDay) : asked > weekStart(maxDay) ? weekStart(maxDay) : asked;

  const [settings, changes, sessions] = await Promise.all([
    loadSettings(db, user.id),
    loadDayChanges(db, user.id),
    db.query<{ date: string; n: number }>(
      `select s.date, count(l.id)::int n from sessions s join set_logs l on l.session_id = s.id and l.superseded_at is null
       where s.user_id = $1 and s.deleted_at is null and s.date between $2::date and $3::date group by s.date`,
      [user.id, monday, addDays(monday, 6)],
    ),
  ]);
  const logged = new Set(sessions.filter((s) => s.n > 0).map((s) => s.date));
  const days = weekPlan(monday, settings.schedule);
  const weekChanges = changes.filter((c) => weekStart(c.date) === monday);
  const inWindow = (d: string) => d >= minDay && d <= maxDay;
  const prev = addDays(monday, -7);
  const next = addDays(monday, 7);

  return (
    <main id="main" className="scr">
      <Header chip={`Wk ${pad2(weekNumber(monday))}`} />
      <TrainNav current="/train/week" />
      <div className="hd">
        <div className="eyebrow">
          Week {weekNumber(monday)} · {PHASE_LABEL[days[0].phase]}
        </div>
        <h1 className="h1">This week</h1>
        <div className="sub">Holiday or a missed day? Move a session to another day this week, or skip it.</div>
      </div>

      {sp.saved && SAVED[sp.saved] ? (
        <p className="form-ok" role="status">
          {SAVED[sp.saved]}
        </p>
      ) : null}
      {sp.error ? (
        <p className="form-error" role="alert">
          {sp.error.slice(0, 200)}
        </p>
      ) : null}

      <nav className="row" aria-label="Weeks">
        {prev >= weekStart(minDay) ? (
          <Link href={`/train/week?w=${prev}`} className="chip">
            ← {fmtShort(prev)}
          </Link>
        ) : (
          <span />
        )}
        {monday !== thisWeek ? (
          <Link href="/train/week" className="chip">
            This week
          </Link>
        ) : null}
        {next <= weekStart(maxDay) ? (
          <Link href={`/train/week?w=${next}`} className="chip">
            {fmtShort(next)} →
          </Link>
        ) : (
          <span />
        )}
      </nav>

      <section className="card flush" aria-label="Days">
        {days.map((p) => {
          const locked = logged.has(p.date);
          const canChange = p.kind === "train" && !locked && inWindow(p.date);
          const targets = days.filter((t) => t.date !== p.date && t.phase !== "pre" && !logged.has(t.date) && inWindow(t.date));
          const name = p.kind === "train" ? p.session.name : "";
          return (
            <div key={p.date} className="log" data-date={p.date}>
              <span className="when">
                {fmtShort(p.date)}
                {p.date === today ? " · today" : ""}
              </span>
              <div>
                <div className="what">{describe(p)}</div>
                {locked ? <div className="because">Logged. It stays as it is.</div> : null}
                {canChange ? (
                  <details className="more">
                    <summary>Move or skip {name}</summary>
                    <form action={moveDayAction} className="stack" style={{ gap: 8, paddingTop: 6 }}>
                      <input type="hidden" name="date" value={p.date} />
                      <label className="field">
                        <span>Move {name} to</span>
                        <select className="select input" name="toDate" required defaultValue="">
                          <option value="" disabled>
                            Pick a day
                          </option>
                          {targets.map((t) => (
                            <option key={t.date} value={t.date}>
                              {fmtShort(t.date)} · {t.kind === "train" ? `swap with ${t.session.name}` : "rest day"}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>Why (optional)</span>
                        <input className="input" name="reason" maxLength={200} placeholder="Holiday, travel…" />
                      </label>
                      <button type="submit" className="btn small inline">
                        Move
                      </button>
                    </form>
                    <form action={skipDayAction} style={{ paddingTop: 8 }}>
                      <input type="hidden" name="date" value={p.date} />
                      <button type="submit" className="btn ghost small inline">
                        Skip {name}
                      </button>
                    </form>
                  </details>
                ) : null}
              </div>
            </div>
          );
        })}
      </section>

      <div className="sec">
        Changes this week <span>undo puts the day back</span>
      </div>
      <section className="card flush" aria-label="Changes this week">
        {weekChanges.length ? (
          weekChanges.map((c) => {
            const stuck = logged.has(c.date) || (c.kind === "move" && logged.has(c.toDate));
            const text = c.kind === "move" ? `Moved ${fmtShort(c.date)} → ${fmtShort(c.toDate)}` : `Skipped ${fmtShort(c.date)}`;
            return (
              <div key={c.id} className="log">
                <span className="when">{localDate(new Date(c.recordedAt)) === today ? "today" : fmtShort(localDate(new Date(c.recordedAt)))}</span>
                <div className="row">
                  <div>
                    <div className="what">{text}</div>
                    {c.reason ? <div className="because">{c.reason}</div> : null}
                  </div>
                  {stuck ? null : (
                    <form action={undoDayChangeAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="week" value={monday} />
                      <button type="submit" className="btn ghost small inline" aria-label={`Undo: ${text}`}>
                        Undo
                      </button>
                    </form>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <p className="sm t3" style={{ padding: "10px 0" }}>
            No changes. The week runs as planned.
          </p>
        )}
      </section>
    </main>
  );
}
