import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getCurrentRun, getSession, loadSettings, sessionSets } from "@/lib/fitness/repo";
import { EXERCISES, LOAD_HINT, TRACKS, SESSION_BY_KEY, type SessionKey } from "@/lib/fitness/program";
import { diffDays, fmtLong, isIsoDate, localDate, now } from "@/lib/time";
import { fmtKg } from "@/lib/fitness/equipment";
import { plural } from "@/lib/format";
import { plannedCard } from "@/lib/views/fitness";
import { reopenSessionAction } from "@/app/actions/fitness";
import { Header } from "@/components/Header";
import { TrainNav } from "@/components/TrainNav";
import { WorkoutLogger, type ExtraOption } from "@/components/workout/WorkoutLogger";

export const metadata: Metadata = { title: "Session" };
export const dynamic = "force-dynamic";

function extraOptions(): ExtraOption[] {
  const seen = new Set<string>();
  const out: ExtraOption[] = [];
  for (const [track, { slot }] of Object.entries(TRACKS)) {
    if (seen.has(slot.exercise) || slot.percentOfMax) continue;
    seen.add(slot.exercise);
    const ex = EXERCISES[slot.exercise];
    out.push({ key: ex.key, name: ex.name, track, equipment: ex.equipment, loadHint: LOAD_HINT[ex.equipment] });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export default async function SessionDayPage({ params }: { params: Promise<{ date: string }> }) {
  const user = await requireUser();
  const { date } = await params;
  const today = localDate(now());
  if (!isIsoDate(date) || date > today) notFound();
  const db = await getDb();
  const [session, run, settings] = await Promise.all([getSession(db, user.id, date), getCurrentRun(db, user.id, date), loadSettings(db, user.id)]);
  const sets = session ? (await sessionSets(db, user.id, session.id)).filter((s) => !s.isWarmup) : [];
  const editable = diffDays(today, date) <= 30;
  // A day with no stored run (before the app was in use) gets that day's plan, computed now.
  const card = run?.output.card ?? (editable && !session?.finishedAt ? await plannedCard(user.id, date) : null);
  const name = session
    ? session.sessionKey === "free"
      ? "Free session"
      : SESSION_BY_KEY[session.sessionKey as SessionKey]?.name ?? session.sessionKey
    : card?.session?.name ?? "No session";
  const showLogger = !session?.finishedAt && editable && Boolean(session || card);
  const plan = card?.session
    ? card.session.focus
    : card
      ? session
        ? "Rest day in the plan"
        : "Rest day in the plan. If you trained, add the exercises below."
      : null;
  const subtitle = [
    showLogger ? plan : `${plural(sets.length, "set")} logged`,
    session && !session.finishedAt ? "still open" : null,
    session?.note ? `“${session.note}”` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <main id="main" className="scr">
      <Header chip="History" />
      <TrainNav current="/train/history" />
      <div className="hd">
        <div className="eyebrow">{fmtLong(date)}</div>
        <h1 className="h1">{name}</h1>
        {subtitle ? <p className="sub">{subtitle}</p> : null}
      </div>
      {session?.finishedAt && editable ? (
        <form action={reopenSessionAction}>
          <input type="hidden" name="sessionId" value={session.id} />
          <button type="submit" className="btn ghost small">
            Edit this session
          </button>
        </form>
      ) : null}
      {showLogger ? (
        <WorkoutLogger
          date={date}
          sessionKey={session?.sessionKey ?? card?.session?.key ?? "free"}
          runId={run?.id ?? null}
          slots={card?.slots ?? []}
          initialSets={sets.map((s) => ({ slot: s.slot, setIndex: s.setIndex, exercise: s.exercise, track: s.track, substituteFor: s.substituteFor, weight: s.weight, reps: s.reps }))}
          barKg={settings.gym.barKg}
          bestSlot={null}
          extraOptions={extraOptions()}
          initialSessionId={session?.id ?? null}
        />
      ) : sets.length ? (
        <section className="card">
          <table className="tbl">
            <thead>
              <tr>
                <th>Lift</th>
                <th className="n">Set</th>
                <th className="n">Kg</th>
                <th className="n">Reps</th>
              </tr>
            </thead>
            <tbody>
              {sets.map((s) => (
                <tr key={s.id}>
                  <td>
                    {EXERCISES[s.exercise]?.name}
                    {s.substituteFor ? " (swap)" : ""}
                  </td>
                  <td className="n">{s.setIndex}</td>
                  <td className="n">{s.weight === null ? "BW" : fmtKg(s.weight)}</td>
                  <td className="n">{s.reps}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <p className="empty">Nothing was logged that day.</p>
      )}
      <Link href="/train/history" className="btn ghost">
        Back to history
      </Link>
    </main>
  );
}
