import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { ensureTodayRun, type ReplayResult } from "@/lib/fitness/agent";
import type { AnnouncedChange } from "@/lib/fitness/coach";
import type { MonthlyAudit, WeeklyReview } from "@/lib/fitness/nutrition";
import { listReviews, listRuns, loadLiftState, loadOverrides, loadTargets } from "@/lib/fitness/repo";
import { EXERCISES, schemeForTrack, parseSubstituteTrack } from "@/lib/fitness/program";
import { targetOn } from "@/lib/fitness/nutrition";
import { fmtKg } from "@/lib/fitness/equipment";
import { decideProposalAction, runCoachAction, runReplayAction, revokeOverrideAction } from "@/app/actions/fitness";
import { describeChange, listAiNotes, listProposals } from "@/lib/ai/coach";
import { AiNote } from "@/components/AiNote";
import { fmtShort, localDate, localTime, now } from "@/lib/time";
import { fmtInt, plural } from "@/lib/format";
import { Header } from "@/components/Header";
import { ScrollX } from "@/components/ScrollX";
import { Icon } from "@/components/Icon";
import { TrainNav } from "@/components/TrainNav";
import { WorkOrder } from "@/components/WorkOrder";
import { OverrideLoadForm, OverrideTargetsForm } from "./OverrideForms";

export const metadata: Metadata = { title: "Coach" };
export const dynamic = "force-dynamic";

function trackName(track: string): string {
  const sub = parseSubstituteTrack(track);
  if (sub) return `${EXERCISES[sub.exercise]?.name ?? sub.exercise} (swap)`;
  const slot = schemeForTrack(track);
  if (!slot) return track;
  if (track === "bench_heavy") return "Bench (heavy)";
  if (track === "bench_volume") return "Bench (volume)";
  return slot.label ?? EXERCISES[slot.exercise]?.name ?? track;
}

export default async function CoachPage({ searchParams }: { searchParams: Promise<{ ai?: string; error?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const at = now();
  const today = localDate(at);
  const run = await ensureTodayRun(db, user.id, at);
  const [runs, overrides, targets, states, weeklies, monthlies, replays] = await Promise.all([
    listRuns(db, user.id, { limit: 120 }),
    loadOverrides(db, user.id),
    loadTargets(db, user.id),
    loadLiftState(db, user.id),
    listReviews<WeeklyReview>(db, user.id, "weekly", 8),
    listReviews<MonthlyAudit>(db, user.id, "monthly", 6),
    listReviews<ReplayResult>(db, user.id, "replay", 6),
  ]);
  const [aiNotes, proposals] = await Promise.all([listAiNotes(db, user.id, 10), listProposals(db, user.id, { limit: 30 })]);
  const pending = proposals.filter((p) => p.status === "pending");
  const decided = proposals.filter((p) => p.status !== "pending").slice(0, 8);

  const seen = new Set<string>();
  const changes: (AnnouncedChange & { runDate: string })[] = [];
  for (const r of runs) {
    for (const c of r.output.changes ?? []) {
      const key = `${c.id}|${c.title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      changes.push({ ...c, runDate: r.runDate });
    }
  }
  const targetOverrides = targets.filter((t) => t.source === "override");
  const current = targetOn(targets, today);
  const trackList = Object.values(states)
    .filter((s) => s.status === "active")
    .sort((a, b) => trackName(a.track).localeCompare(trackName(b.track)));

  return (
    <main id="main" className="scr">
      <Header chip={`Rules ${run.rulesVersion}`} />
      <TrainNav current="/coach" />
      <div className="hd">
        <div className="eyebrow">Fitness coach · runs every morning</div>
        <h1 className="h1">Coach</h1>
        <p className="sub">
          Loads, reps and calories follow fixed, versioned rules. Every change is listed here with its reason, and you can override any of them.
        </p>
      </div>

      <WorkOrder note={run.output.note} asOf={run.asOf} revision={run.revision} />
      <div className="btn-row">
        <form action={runCoachAction}>
          <button type="submit" className="btn ghost small" style={{ width: "100%" }}>
            <Icon name="play" size={14} /> Run coach now
          </button>
        </form>
        <Link href="/coach/rules" className="btn ghost small">
          Rules {run.rulesVersion}
        </Link>
      </div>
      <p className="sm t3">
        Today&apos;s run: revision {run.revision}, {run.trigger} at {localTime(new Date(run.asOf))}. Cron fallback runs at 10:00–11:00 every day.
      </p>

      <div className="sec" id="ai">
        AI coach <span>runs 14:30 · Mondays weekly</span>
      </div>
      {sp.ai === "approved" ? (
        <p className="form-ok" role="status">
          Approved. The change is applied and listed below.
        </p>
      ) : sp.ai === "rejected" ? (
        <p className="form-ok" role="status">
          Rejected. The AI coach sees your decision on its next run.
        </p>
      ) : null}
      {sp.error ? (
        <p className="form-error" role="alert">
          {sp.error.slice(0, 200)}
        </p>
      ) : null}
      {aiNotes[0] ? (
        <AiNote note={aiNotes[0]} runAsOf={run.asOf} pending={0} link={false} />
      ) : (
        <p className="sm t3">No AI coach runs yet. It changes loads, reps, calories and days within limits; bigger changes wait here for you.</p>
      )}
      <section className="card flush" aria-label="Waiting for you">
        <div className="lbl" style={{ padding: "10px 0 4px" }}>
          Waiting for you · {pending.length}
        </div>
        {pending.length ? (
          pending.map((p) => (
            <div key={p.id} className="log">
              <span className="when">{fmtShort(p.date)}</span>
              <div className="stack tight">
                <div className="what">{describeChange(p.change)}</div>
                {p.change.type !== "suggest" ? <div className="because">{p.reason}</div> : null}
                <div className="sm t3">Needs you: {p.whyReview}</div>
                <div className="row" style={{ justifyContent: "flex-start" }}>
                  <form action={decideProposalAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="decision" value="approve" />
                    <button type="submit" className="btn small inline" aria-label={`Approve: ${describeChange(p.change)}`}>
                      {p.change.type === "suggest" ? "Noted" : "Approve"}
                    </button>
                  </form>
                  <form action={decideProposalAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="decision" value="reject" />
                    <button type="submit" className="btn ghost small inline" aria-label={`Reject: ${describeChange(p.change)}`}>
                      {p.change.type === "suggest" ? "Dismiss" : "Reject"}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          ))
        ) : (
          <p className="sm t3" style={{ padding: "6px 0 10px" }}>
            Nothing to approve.
          </p>
        )}
      </section>
      {aiNotes.length ? (
        <details className="more">
          <summary>AI coach notebook and past notes</summary>
          <p className="sm t3">Its memory between runs. It reads this first every morning.</p>
          {aiNotes[0].notebook ? <p className="sm" style={{ whiteSpace: "pre-line" }}>{aiNotes[0].notebook}</p> : null}
          <div className="card flush">
            {aiNotes.map((n) => (
              <div key={n.id} className="log">
                <span className="when">
                  {fmtShort(n.date)}
                  {n.kind === "weekly" ? " · wk" : ""}
                </span>
                <div className="because">{n.note}</div>
              </div>
            ))}
          </div>
          {decided.length ? (
            <div className="card flush">
              {decided.map((p) => (
                <div key={p.id} className="log">
                  <span className="when">{p.status}</span>
                  <div className="because">{describeChange(p.change)}</div>
                </div>
              ))}
            </div>
          ) : null}
        </details>
      ) : null}

      <div className="sec">
        What changed <span>{changes.length}</span>
      </div>
      <section className="card flush" aria-label="Changelog">
        {changes.length ? (
          changes.slice(0, 15).map((c) => (
            <div key={`${c.id}-${c.runDate}`} className="log">
              <span className="when">{c.effective ? fmtShort(c.effective) : fmtShort(c.runDate)}</span>
              <div className="stack tight">
                <div className="what">{c.title}</div>
                <div className="because">
                  {c.reason} <span className="t3">[{c.rule}]</span>
                </div>
                {c.kind === "load" && c.track && c.rule !== "O1" ? (
                  <details className="more">
                    <summary>Override</summary>
                    <OverrideLoadForm track={c.track} suggested={c.from ?? c.to} changeRef={c.id} />
                  </details>
                ) : null}
              </div>
            </div>
          ))
        ) : (
          <p className="sm t3" style={{ padding: "10px 0" }}>
            No changes yet. The first ones arrive with the week-3 baselines.
          </p>
        )}
      </section>
      {changes.length > 15 ? (
        <details className="more">
          <summary>Earlier changes ({changes.length - 15})</summary>
          <section className="card flush" aria-label="Earlier changes">
            {changes.slice(15, 300).map((c) => (
              <div key={`${c.id}-${c.runDate}`} className="log">
                <span className="when">{c.effective ? fmtShort(c.effective) : fmtShort(c.runDate)}</span>
                <div>
                  <div className="what">{c.title}</div>
                  <div className="because">
                    {c.reason} <span className="t3">[{c.rule}]</span>
                  </div>
                </div>
              </div>
            ))}
          </section>
        </details>
      ) : null}

      <div className="sec">
        Overrides <span>{overrides.length + targetOverrides.length} active</span>
      </div>
      <section className="card" aria-label="Overrides">
        {overrides.length + targetOverrides.length === 0 ? <p className="sm t3">None. The coach&apos;s numbers stand.</p> : null}
        {overrides.map((o) => (
          <form key={o.id} action={revokeOverrideAction} className="row">
            <input type="hidden" name="id" value={o.id} />
            <input type="hidden" name="kind" value="track" />
            <div className="grow">
              <div className="tt">
                {trackName(o.target.replace(/^track:/, ""))} → {o.field === "weight" ? `${fmtKg(Number(o.value))} kg` : String(o.value)}
              </div>
              <div className="meta">
                From {fmtShort(o.date)}
                {o.reason ? ` · ${o.reason}` : ""}
              </div>
            </div>
            <button type="submit" className="chip">
              <Icon name="undo" size={12} /> Undo
            </button>
          </form>
        ))}
        {targetOverrides.map((t) => (
          <form key={t.id} action={revokeOverrideAction} className="row">
            <input type="hidden" name="id" value={t.id} />
            <input type="hidden" name="kind" value="targets" />
            <div className="grow">
              <div className="tt">
                Targets → {fmtInt(t.kcal)} kcal · {fmtKg(t.protein)} P · {fmtKg(t.carbs)} C · {fmtKg(t.fat)} F
              </div>
              <div className="meta">
                From {fmtShort(t.effectiveDate)} · {t.reason}
              </div>
            </div>
            <button type="submit" className="chip">
              <Icon name="undo" size={12} /> Undo
            </button>
          </form>
        ))}
        <details className="more">
          <summary>Set calorie targets by hand</summary>
          <OverrideTargetsForm current={{ kcal: current.kcal, protein: current.protein, carbs: current.carbs, fat: current.fat }} />
        </details>
      </section>

      <div className="sec" id="reviews">
        Weekly reviews <span>Mondays</span>
      </div>
      <section className="card flush" aria-label="Weekly reviews">
        {weeklies.length ? (
          weeklies.map((r) => (
            <div key={r.id} className="log">
              <span className="when">{fmtShort(r.period_date)}</span>
              <div>
                <div className="what">{statusLabel(r.result.status)}</div>
                <div className="because">{r.result.summary}</div>
              </div>
            </div>
          ))
        ) : (
          <p className="sm t3" style={{ padding: "10px 0" }}>
            The first weekly review runs on a Monday once three full weeks after the ramp-in are logged.
          </p>
        )}
      </section>

      {monthlies.length ? (
        <>
          <div className="sec">Monthly audits</div>
          <section className="card flush" aria-label="Monthly audits">
            {monthlies.map((r) => (
              <div key={r.id} className="log">
                <span className="when">{fmtShort(r.period_date)}</span>
                <div>
                  <div className="what">{statusLabel(r.result.status)}</div>
                  <div className="because">{r.result.summary}</div>
                  {r.result.lifts ? <div className="because t3">{r.result.lifts.detail}</div> : null}
                </div>
              </div>
            ))}
          </section>
        </>
      ) : null}

      <div className="sec" id="audit">
        Replay audit <span>first Monday each month</span>
      </div>
      <section className="card" aria-label="Replay audit">
        <p className="sm t2">
          Recomputes every stored prescription from the log as it stood that morning and compares. Any difference means drift.
        </p>
        {replays.length ? (
          replays.map((r) => (
            <div key={r.id} className="row start">
              <div>
                <div className="tt">
                  {fmtShort(r.period_date)} · {plural(r.result.checked, "run")} checked
                </div>
                {r.result.divergences.slice(0, 5).map((d, i) => (
                  <div key={i} className="meta bad">
                    {fmtShort(d.date)}: {d.field} differs
                  </div>
                ))}
              </div>
              <span className={`chip ${r.result.divergent === 0 ? "good" : "warn"}`}>
                {r.result.divergent === 0 ? "No drift" : `${r.result.divergent} drifted`}
              </span>
            </div>
          ))
        ) : (
          <p className="sm t3">No replay has run yet.</p>
        )}
        <form action={runReplayAction}>
          <button type="submit" className="btn ghost small">
            <Icon name="history" size={14} /> Run the replay test now
          </button>
        </form>
      </section>

      <details className="more">
        <summary>Lift state table ({plural(trackList.length, "lift")})</summary>
      <section className="card" aria-label="Lift state table">
        {trackList.length ? (
          <ScrollX label="Lift state">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Lift</th>
                  <th className="n">Load</th>
                  <th className="n">Reps</th>
                  <th className="n">Miss</th>
                  <th className="n">Last</th>
                </tr>
              </thead>
              <tbody>
                {trackList.map((s) => {
                  const ex = EXERCISES[s.exercise];
                  const load = s.weight === null ? "BW" : ex?.equipment === "belt" ? `+${fmtKg(s.weight)}` : fmtKg(s.weight);
                  return (
                    <tr key={s.track}>
                      <td>{trackName(s.track)}</td>
                      <td className="n">{load}</td>
                      <td className="n">{s.repTargets.join("·")}</td>
                      <td className="n">{s.misses}</td>
                      <td className="n">{s.lastSession ? fmtShort(s.lastSession).slice(4) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollX>
        ) : (
          <p className="sm t3">Empty until the first working sessions after the ramp-in. The table is rebuilt from the log on every run.</p>
        )}
      </section>
      </details>

      <details className="more">
        <summary>Run history ({plural(runs.length, "day")})</summary>
        <table className="tbl">
          <tbody>
            {runs.slice(0, 30).map((r) => (
              <tr key={r.id}>
                <td>{fmtShort(r.runDate)}</td>
                <td>
                  rev {r.revision} · {r.trigger}
                </td>
                <td className="n">{localTime(new Date(r.asOf))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </main>
  );
}

function statusLabel(s: string): string {
  switch (s) {
    case "change":
      return "Calories changed";
    case "hold":
      return "No change";
    case "blocked":
      return "Couldn't run";
    case "insufficient":
      return "Not enough data";
    case "cooldown":
      return "Waiting (cooldown)";
    default:
      return "Not started";
  }
}
