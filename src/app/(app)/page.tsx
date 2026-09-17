import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { homeView } from "@/lib/views/fitness";
import { getDb } from "@/lib/db";
import { listTasks, bucketOf } from "@/lib/modules/tasks";
import { headlineSlot, loadText, repRangeText } from "@/lib/fitness/card";
import { fmtKg } from "@/lib/fitness/equipment";
import { SESSIONS } from "@/lib/fitness/program";
import { fmtDuration, fmtShort, localTime } from "@/lib/time";
import { fmtInt, fmtSignedKg, pad2, plural } from "@/lib/format";
import { Header } from "@/components/Header";
import { Icon } from "@/components/Icon";
import { Plates } from "@/components/Plates";
import { TaskRow } from "@/components/TaskRow";
import { WorkOrder } from "@/components/WorkOrder";

export const dynamic = "force-dynamic";

const GREETING = { morning: "Morning", day: "Afternoon", evening: "Evening", night: "Night" } as const;

export default async function Home() {
  const user = await requireUser();
  const v = await homeView(user.id);
  const { out, run, part, today } = v;
  const card = out.card;
  const tasks = (await listTasks(await getDb(), user.id)).filter((t) => bucketOf(t, today) === "today");
  const firstName = user.displayName.split(" ")[0] || "there";

  const checkedIn = !!v.todayWeigh;
  const avg = out.morning.sevenDay.avg;
  const bench = v.bests.bench;
  const gym = v.settings.gym;

  const checkin = !checkedIn ? (
    <section className="card warn-edge" aria-labelledby="checkin-h">
      <div className="row">
        <span id="checkin-h" className="lbl">
          Morning check-in
        </span>
        <span className="chip">
          <Icon name="scale" size={13} /> Due
        </span>
      </div>
      <p className="sub">Weigh in after the bathroom, before food or water. Then sleep and wake times.</p>
      <Link href="/checkin" className="btn">
        <Icon name="scale" size={20} /> Log weigh-in
      </Link>
    </section>
  ) : null;

  const hero =
    card.kind === "train" && card.session ? (
      <>
        <span className="st-tag">
          <b>Station {pad2(SESSIONS.findIndex((x) => x.key === card.session!.key) + 1)}</b>
          <span>
            {v.session?.finishedAt ? "Done tonight" : `Tonight · ~${card.session.minutes} min`}
            {card.optionalDay ? " · optional" : ""}
          </span>
        </span>
        <section className="st-hero" aria-label="Today's session">
          <div className="st-sess">
            {card.session.name.split(" ")[0]} <span>{card.session.name.split(" ").slice(1).join(" ")}</span>
          </div>
          <div className="lbl">
            {card.session.focus} · {plural(card.slots.length, "exercise")} · {plural(card.totalSets, "set")}
            {card.session.cardio ? ` · cardio ${card.session.cardio}` : ""}
          </div>
          <HeroLift out={out} barKg={gym.barKg} />
          {v.session?.finishedAt ? (
            <Link href="/train" className="btn ghost">
              <Icon name="check" size={20} /> Session logged · {plural(v.loggedSets, "set")}
            </Link>
          ) : (
            <Link href="/train" className="btn">
              {v.loggedSets > 0 ? `Continue · ${plural(v.loggedSets, "set")} in` : "Start session"}
            </Link>
          )}
        </section>
      </>
    ) : (
      <section className="st-hero" aria-label="Rest day">
        <div className="st-sess">
          Rest <span>day</span>
        </div>
        <p className="sub">{card.restReason}</p>
        <Link href="/train" className="btn ghost">
          Open training
        </Link>
      </section>
    );

  const gate = out.gate;
  const lamps = (
    <div className="st-lamps">
      <div className="lamp">
        <i className={gate.sleepOk === null ? "unknown" : gate.sleepOk ? "on" : "off"} />
        <div>
          <span className="lbl">Sleep</span>
          <b>{gate.sleepMinutes === null ? "—" : fmtDuration(gate.sleepMinutes)}</b>
        </div>
      </div>
      <div className="lamp">
        <i className={gate.kcalOk === null ? "unknown" : gate.kcalOk ? "on" : "off"} />
        <div>
          <span className="lbl">Food yesterday</span>
          <b>{gate.kcalFraction === null ? "—" : `${Math.round(gate.kcalFraction * 100)}%`}</b>
        </div>
      </div>
    </div>
  );

  const bannerState =
    gate.status === "open"
      ? { cls: "go", text: "Cleared" }
      : gate.status === "closed"
        ? { cls: "off", text: "Hold" }
        : gate.status === "missing"
          ? { cls: "off", text: "Not logged" }
          : { cls: "off", text: card.phase === "baseline" ? "Test week" : "Ramp-in" };
  const banner =
    card.kind === "train" ? (
      <div className={`st-banner ${bannerState.cls}`} role="status">
        <span>Best-set attempt</span>
        <span>{bannerState.text}</span>
      </div>
    ) : null;

  const nightTarget = v.tonightTarget;
  const tonight = v.tonight;
  const grid = (
    <div className="st-grid">
      <div>
        <span className="lbl">Weight</span>
        <b>{avg === null ? "—" : avg.toFixed(1)}</b>
        <span className="sm t2">{out.morning.weeklyChange === null ? "7-day avg" : `${fmtSignedKg(out.morning.weeklyChange)} / wk`}</span>
      </div>
      <Link href="/tonight">
        <span className="lbl">Protein</span>
        <b>{tonight ? Math.round(tonight.protein) : "—"}</b>
        <span className="sm t2">of {nightTarget.protein} g</span>
      </Link>
      <Link href="/tonight">
        <span className="lbl">Kcal</span>
        <b>{tonight ? fmtInt(tonight.kcal) : "—"}</b>
        <span className="sm t2">of {fmtInt(nightTarget.kcal)}</span>
      </Link>
    </div>
  );

  const tonightBlock =
    part === "evening" || part === "night" ? (
      <section className={`card${tonight ? "" : " warn-edge"}`} aria-labelledby="tonight-h">
        <div className="row">
          <span id="tonight-h" className="lbl">
            Tonight · Cronometer totals
          </span>
          <span className={`chip${tonight ? " good" : ""}`}>{tonight ? "Logged" : "Four numbers"}</span>
        </div>
        {tonight ? (
          <p className="sub">
            {fmtInt(tonight.kcal)} kcal · {Math.round(tonight.protein)} P · {Math.round(tonight.carbs)} C · {Math.round(tonight.fat)} F for{" "}
            {fmtShort(v.nightDate)}.
          </p>
        ) : (
          <p className="sub">
            Targets: {fmtInt(nightTarget.kcal)} kcal · {nightTarget.protein} P · {fmtKg(nightTarget.carbs)} C · {nightTarget.fat} F.
          </p>
        )}
        <Link href="/tonight" className={tonight ? "btn ghost" : "btn"}>
          <Icon name="food" size={20} /> {tonight ? "Edit totals" : "Log totals"}
        </Link>
      </section>
    ) : null;

  const regain = bench?.best ? (
    <Link href="/train/progress" className="card" style={{ textDecoration: "none" }}>
      <div className="row">
        <span className="lbl">{bench.peakPassed ? "Road to a 100 kg bench" : "Bench regain"}</span>
        <span className="lbl" style={{ color: "var(--ink)" }}>
          {bench.peakPassed ? `${Math.round(bench.best.e1rm)}%` : `${bench.regainPct}%`}
        </span>
      </div>
      <div className="meter">
        <i style={{ width: `${bench.peakPassed ? Math.min(100, bench.best.e1rm) : bench.regainPct}%` }} />
      </div>
      <div className="sm t2">
        Estimated max {fmtKg(bench.best.e1rm)} kg{bench.peak && !bench.peakPassed ? ` of your ${bench.peak.e1rm} kg December 2025 peak` : " of 100 kg"}
      </div>
    </Link>
  ) : null;

  const note = <WorkOrder note={out.note} asOf={run.asOf} compact revision={run.revision} />;

  const taskList = (
    <>
      <div className="sec">
        Today · {plural(tasks.length, "task")}
        <Link href="/plan">All →</Link>
      </div>
      {tasks.length ? (
        <div className="list">
          {tasks.slice(0, 3).map((t) => (
            <TaskRow key={t.id} task={t} today={today} edit={false} />
          ))}
        </div>
      ) : (
        <p className="sm t3">Nothing due today.</p>
      )}
    </>
  );

  const order =
    part === "morning"
      ? [checkin, hero, lamps, banner, grid, note, regain, taskList]
      : part === "night"
        ? [tonightBlock, note, grid, hero, checkin, regain, taskList]
        : [hero, lamps, banner, tonightBlock, note, grid, checkin, regain, taskList];

  return (
    <main id="main" className="scr">
      <Header chip={`Wk ${pad2(out.week)} · ${fmtShort(today)}`} />
      <div className="row start">
        <h1 className="h1">
          {GREETING[part]}, {firstName}
        </h1>
        {v.streak.current > 0 ? (
          <span className="chip warn" title={`Best run: ${plural(v.streak.best, "day")}`}>
            <Icon name="flame" size={13} /> {v.streak.current}-day streak
          </span>
        ) : null}
      </div>
      <p className="sm t3">
        {out.phaseLabel} · coach ran {localTime(new Date(run.asOf))}
      </p>
      {order.map((node, i) => (node ? <div key={i} className="stack">{node}</div> : null))}
    </main>
  );
}

function HeroLift({ out, barKg }: { out: Awaited<ReturnType<typeof homeView>>["out"]; barKg: number }) {
  const h = headlineSlot(out.card);
  if (!h) return null;
  const change = h.change && h.change.from !== null && h.change.to !== null ? h.change.to - h.change.from : null;
  return (
    <>
      {h.plates && h.weight !== null ? <Plates plates={h.plates} barKg={barKg} totalKg={h.weight} /> : null}
      <div className="st-lift">
        <span className="lbl">{h.label.replace(/^Barbell /, "")}</span>
        <b>{h.weight !== null ? fmtKg(h.weight) : "—"}</b>
        <span>
          {h.weight !== null ? "kg · " : `${loadText(h)} · `}
          {h.sets} × {repRangeText(h.reps)}
        </span>
        {change ? <span className={`chip ${change > 0 ? "up" : "down"}`}>{change > 0 ? "+" : "−"}{fmtKg(Math.abs(change))} kg</span> : null}
      </div>
    </>
  );
}
