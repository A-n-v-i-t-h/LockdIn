import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { fitnessBasics } from "@/lib/views/fitness";
import { EXERCISES, SESSION_BY_KEY, type SessionKey } from "@/lib/fitness/program";
import { sleepMinutes } from "@/lib/fitness/readiness";
import { isRampIn } from "@/lib/fitness/schedule";
import { fmtKg } from "@/lib/fitness/equipment";
import { addDays, fmtDuration, fmtShort, now } from "@/lib/time";
import { fmtInt, plural } from "@/lib/format";
import { Header } from "@/components/Header";
import { ScrollX } from "@/components/ScrollX";
import { TrainNav } from "@/components/TrainNav";
import { PastDayPicker } from "./PastDayPicker";

export const metadata: Metadata = { title: "History" };
export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const user = await requireUser();
  const v = await fitnessBasics(user.id, now());
  const since = addDays(v.today, -60);
  const sessions = await v.db.query<{ id: string; date: string; session_key: string; finished_at: string | null }>(
    `select id, date, session_key, finished_at from sessions
     where user_id = $1 and deleted_at is null and date >= $2::date order by date desc`,
    [user.id, since],
  );
  const setsByDate = new Map<string, typeof v.sets>();
  for (const s of v.sets) setsByDate.set(s.date, [...(setsByDate.get(s.date) ?? []), s]);

  const weighIns = [...v.weighIns].reverse().slice(0, 30);
  const food = [...v.nutrition].reverse().slice(0, 30);

  return (
    <main id="main" className="scr">
      <Header chip="History" />
      <TrainNav current="/train/history" />
      <div className="hd">
        <div className="eyebrow">Everything is kept · edits keep the old version</div>
        <h1 className="h1">History</h1>
      </div>

      <div className="sec">
        Log a past day <span>last 30 days</span>
      </div>
      <PastDayPicker min={addDays(v.today, -30)} max={addDays(v.today, -1)} />

      <div className="sec">
        Sessions <span>last 60 days</span>
      </div>
      <section className="card flush" aria-label="Sessions">
        {sessions.length ? (
          sessions.map((s) => {
            const sets = (setsByDate.get(s.date) ?? []).filter((x) => !x.isWarmup);
            const lifts = new Set(sets.map((x) => x.exercise)).size;
            const name = s.session_key === "free" ? "Free session" : SESSION_BY_KEY[s.session_key as SessionKey]?.name ?? s.session_key;
            const top = sets
              .filter((x) => x.slot === "1")
              .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))[0];
            return (
              <Link key={s.id} href={`/train/history/${s.date}`} className="log" style={{ textDecoration: "none" }}>
                <span className="when">{fmtShort(s.date)}</span>
                <div>
                  <div className="what">
                    {name} · {plural(sets.length, "set")} · {plural(lifts, "lift")}{isRampIn(s.date) ? " · ramp-in" : ""}
                    {s.finished_at ? "" : " · open"}
                  </div>
                  {top ? (
                    <div className="because">
                      {EXERCISES[top.exercise]?.name}: {top.weight === null ? "BW" : `${fmtKg(top.weight)} kg`} × {top.reps}
                    </div>
                  ) : null}
                </div>
              </Link>
            );
          })
        ) : (
          <p className="sm t3" style={{ padding: "10px 0" }}>
            No sessions logged yet.
          </p>
        )}
      </section>

      <div className="sec">
        Weigh-ins <span>last 30</span>
      </div>
      <section className="card" aria-label="Weigh-ins">
        {weighIns.length ? (
          <ScrollX label="Weigh-in table">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Day</th>
                  <th className="n">Kg</th>
                  <th className="n">Sleep</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {weighIns.map((w) => {
                  const sl = sleepMinutes(w.bedAt, w.wakeAt);
                  return (
                    <tr key={w.id}>
                      <td>
                        <Link href={`/checkin?date=${w.date}`} className="link plain">
                          {fmtShort(w.date)}
                        </Link>
                      </td>
                      <td className="n">{w.weight === null ? "—" : w.weight.toFixed(2)}</td>
                      <td className="n">{sl === null ? "—" : fmtDuration(sl)}</td>
                      <td className="sm t3">{w.protocolOk ? (isRampIn(w.date) ? "ramp-in" : "") : "off-protocol"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollX>
        ) : (
          <p className="sm t3">No weigh-ins yet.</p>
        )}
      </section>

      <div className="sec">
        Food totals <span>last 30</span>
      </div>
      <section className="card" aria-label="Food totals">
        {food.length ? (
          <ScrollX label="Food totals table">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Day</th>
                  <th className="n">Kcal</th>
                  <th className="n">P</th>
                  <th className="n">C</th>
                  <th className="n">F</th>
                </tr>
              </thead>
              <tbody>
                {food.map((n) => (
                  <tr key={n.id}>
                    <td>
                      <Link href={`/tonight?date=${n.date}`} className="link plain">
                        {fmtShort(n.date)}
                      </Link>
                    </td>
                    <td className="n">{fmtInt(n.kcal)}</td>
                    <td className="n">{Math.round(n.protein)}</td>
                    <td className="n">{Math.round(n.carbs)}</td>
                    <td className="n">{Math.round(n.fat)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollX>
        ) : (
          <p className="sm t3">No totals yet.</p>
        )}
      </section>
      <p className="sm t3">
        Weigh-ins and totals from the last 30 days can be corrected by tapping the date. The coach re-runs today when an earlier day changes.
      </p>
    </main>
  );
}
