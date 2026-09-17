import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { previewNextCard, trainView } from "@/lib/views/fitness";
import { EXERCISES, LOAD_HINT, TRACKS } from "@/lib/fitness/program";
import { fmtKg } from "@/lib/fitness/equipment";
import { bestEventText } from "@/lib/fitness/bests";
import { fmtShort } from "@/lib/time";
import { pad2, plural } from "@/lib/format";
import { reopenSessionAction } from "@/app/actions/fitness";
import { Header } from "@/components/Header";
import { Icon } from "@/components/Icon";
import { WorkoutLogger, type ExtraOption } from "@/components/workout/WorkoutLogger";
import { TrainNav } from "@/components/TrainNav";

export const metadata: Metadata = { title: "Train" };
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

export default async function TrainPage() {
  const user = await requireUser();
  const v = await trainView(user.id);
  const { out, run, session } = v;
  const card = out.card;
  const finished = !!session?.finishedAt;
  const logged = v.logged
    .filter((s) => !s.isWarmup)
    .map((s) => ({ slot: s.slot, setIndex: s.setIndex, exercise: s.exercise, track: s.track, substituteFor: s.substituteFor, weight: s.weight, reps: s.reps }));
  const bestSlot = card.slots.find((s) => s.bestSetAllowed && s.status === "working")?.slot ?? null;
  const gate = out.gate;

  return (
    <main id="main" className="scr">
      <Header chip={`Wk ${pad2(out.week)} · ${fmtShort(v.today)}`} />
      <TrainNav current="/train" />
      <div className="hd">
        <div className="eyebrow">
          Week {out.week} · {fmtShort(v.today)} · {out.phaseLabel}
        </div>
        <h1 className="h1">{card.kind === "train" ? card.session!.name : "Rest day"}</h1>
        <div className="sub">
          {card.kind === "train"
            ? `${card.session!.focus} · ${plural(card.slots.length, "exercise")} · ${plural(card.totalSets, "set")} · ~${card.session!.minutes} min${card.session!.cardio ? ` · then cardio ${card.session!.cardio}` : ""}`
            : card.restReason}
        </div>
      </div>

      {card.kind === "train" && card.phase !== "rampin" && card.phase !== "baseline" ? (
        <section className="card ready" aria-label="Readiness">
          <span className={`dot${gate.open ? "" : " off"}`}>
            <Icon name="bolt" size={20} stroke={2} />
          </span>
          <div>
            <div style={{ fontWeight: 800 }}>{gate.open ? "Best-set attempt is on" : gate.status === "missing" ? "Readiness not logged" : "Planned loads today"}</div>
            <div className="sm t2">{gate.reasons.join(" ")}</div>
          </div>
        </section>
      ) : null}

      {card.notes.map((n, i) => (
        <p key={i} className="why">
          {n}
        </p>
      ))}
      {card.optionalDay ? <p className="sm t3">Trainer block: train today only if it&apos;s one of your 3–4 days.</p> : null}

      {finished && session ? (
        <SessionSummary userId={user.id} date={v.today} sessionId={session.id} note={session.note} logged={logged} />
      ) : (
        <WorkoutLogger
          date={v.today}
          sessionKey={card.session?.key ?? "free"}
          runId={run.id}
          slots={card.slots}
          initialSets={logged}
          barKg={v.settings.gym.barKg}
          bestSlot={bestSlot}
          extraOptions={extraOptions()}
          initialSessionId={session?.id ?? null}
        />
      )}
    </main>
  );
}

async function SessionSummary({
  userId,
  date,
  sessionId,
  note,
  logged,
}: {
  userId: string;
  date: string;
  sessionId: string;
  note: string;
  logged: { slot: string; exercise: string; track: string; weight: number | null; reps: number }[];
}) {
  const preview = await previewNextCard(userId, date);
  const todays = new Set(logged.map((s) => s.track));
  const nextChanges = Object.values(preview.states)
    .filter((st) => todays.has(st.track) && st.lastSession === date)
    .map((st) => ({ st, ex: EXERCISES[st.exercise] }));
  const bySlot = new Map<string, typeof logged>();
  for (const s of logged) bySlot.set(s.slot, [...(bySlot.get(s.slot) ?? []), s]);
  const volume = logged.reduce((a, s) => a + (s.weight ?? 0) * s.reps, 0);
  const newBests = preview.bestEvents.filter((e) => e.set.date === date);

  return (
    <>
      <section className="st-hero" aria-label="Session summary">
        <div className="row">
          <span className="lbl">Session logged</span>
          <span className="chip good">
            <Icon name="check" size={12} stroke={2.6} /> Done
          </span>
        </div>
        <div className="st-grid">
          <div>
            <span className="lbl">Sets</span>
            <b>{logged.length}</b>
          </div>
          <div>
            <span className="lbl">Lifts</span>
            <b>{bySlot.size}</b>
          </div>
          <div>
            <span className="lbl">Volume</span>
            <b>{Math.round(volume).toLocaleString("en-US")}</b>
            <span className="sm t2">kg lifted</span>
          </div>
        </div>
        {note ? <p className="sub">“{note}”</p> : null}
      </section>
      {newBests.length ? (
        <section className="card accent-edge" aria-label="New bests">
          <span className="lbl">New bests tonight</span>
          <ul className="fb">
            {newBests.map((b, i) => (
              <li key={i} className="good">
                {bestEventText(b)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="card flush" aria-label="Next time">
        <div className="lbl" style={{ padding: "10px 0 4px" }}>
          Next time · preview, confirmed by tomorrow&apos;s coach run
        </div>
        {nextChanges.length ? (
          nextChanges.map(({ st, ex }) => (
            <div key={st.track} className="log">
              <span className="when">{ex?.name.split(" ").slice(-2).join(" ") ?? st.track}</span>
              <div>
                <div className="what">
                  {st.weight === null ? "Bodyweight" : `${fmtKg(st.weight)} kg`} · {st.repTargets.join(", ")} reps
                </div>
                <div className="because">
                  {preview.changes.find((c) => c.track === st.track)?.reason ??
                    (st.misses > 0 ? `Same load. Miss ${st.misses} of 3 in a row.` : "Same load, one more rep per set where you can.")}
                </div>
              </div>
            </div>
          ))
        ) : (
          <p className="sm t3" style={{ padding: "6px 0 10px" }}>
            Nothing to project yet: baseline and ramp-in sessions set the starting points instead.
          </p>
        )}
      </section>
      <details className="more">
        <summary>What you logged</summary>
        <table className="tbl">
          <thead>
            <tr>
              <th>Lift</th>
              <th className="n">Sets</th>
            </tr>
          </thead>
          <tbody>
            {[...bySlot.entries()].map(([slot, list]) => (
              <tr key={slot}>
                <td>{EXERCISES[list[0].exercise]?.name ?? list[0].exercise}</td>
                <td className="n">{list.map((s) => `${s.weight === null ? "BW" : fmtKg(s.weight)}×${s.reps}`).join("  ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <form action={reopenSessionAction}>
        <input type="hidden" name="sessionId" value={sessionId} />
        <button type="submit" className="btn ghost">
          <Icon name="edit" size={18} /> Edit this session
        </button>
      </form>
      <Link href="/train/progress" className="btn">
        See progress
      </Link>
    </>
  );
}
