import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { calendarItems, listCommitments, monthGrid, type CalendarItem } from "@/lib/modules/calendar";
import { listTasks } from "@/lib/modules/tasks";
import { listGoals } from "@/lib/modules/goals";
import { addDays, addMonths, daysInMonth, fmt12h, fmtMonth, fmtRelative, fmtShort, isIsoDate, localDate, monthStart, now } from "@/lib/time";
import { plural } from "@/lib/format";
import { deleteCommitmentAction } from "@/app/actions/modules";
import { Header } from "@/components/Header";
import { Icon } from "@/components/Icon";
import { CommitmentForm } from "./CommitmentForm";

export const metadata: Metadata = { title: "Calendar" };
export const dynamic = "force-dynamic";

const MARK: Record<CalendarItem["kind"], string> = { task: "t", goal: "g", commitment: "c" };

function Kind({ item }: { item: CalendarItem }) {
  return (
    <span className="kind">
      <span className="mk" aria-hidden="true">
        <i className={MARK[item.kind]} />
      </span>
      {item.detail}
      {item.done ? " · done" : ""}
    </span>
  );
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string; d?: string; edit?: string }> }) {
  const user = await requireUser();
  const db = await getDb();
  const today = localDate(now());
  const sp = await searchParams;
  const month = sp.m && /^\d{4}-\d{2}$/.test(sp.m) && isIsoDate(`${sp.m}-01`) ? `${sp.m}-01` : monthStart(today);
  const selected = sp.d && isIsoDate(sp.d) ? sp.d : month === monthStart(today) ? today : month;
  const monthEnd = addDays(month, daysInMonth(month) - 1);
  const horizonEnd = addDays(today, 60);
  const from = month < today ? month : today;
  const to = monthEnd > horizonEnd ? monthEnd : horizonEnd;

  const [tasks, goals, commitments] = await Promise.all([listTasks(db, user.id), listGoals(db, user.id), listCommitments(db, user.id, from < selected ? from : selected, to > selected ? to : selected)]);
  const items = calendarItems(from < selected ? from : selected, to > selected ? to : selected, tasks, goals, commitments);
  const byDate = new Map<string, CalendarItem[]>();
  for (const it of items) byDate.set(it.date, [...(byDate.get(it.date) ?? []), it]);
  const dayItems = byDate.get(selected) ?? [];
  const upcoming = items.filter((i) => i.date > selected && i.date <= addDays(selected, 45) && !i.done).slice(0, 12);
  const editing = sp.edit ? commitments.find((c) => c.id === sp.edit) ?? null : null;

  const prev = addMonths(month, -1).slice(0, 7);
  const next = addMonths(month, 1).slice(0, 7);
  const cells = monthGrid(month);

  return (
    <main id="main" className="scr">
      <Header chip={fmtShort(today)} />
      <div className="row">
        <div className="hd">
          <div className="eyebrow">{month.slice(0, 4)}</div>
          <h1 className="h1">{fmtMonth(month)}</h1>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <Link className="iconbtn" href={`/calendar?m=${prev}`} aria-label="Previous month">
            <Icon name="back" size={18} />
          </Link>
          <Link className="iconbtn" href={`/calendar?m=${next}`} aria-label="Next month">
            <Icon name="chev" size={18} />
          </Link>
        </div>
      </div>

      <section className="card" aria-label={`${fmtMonth(month)} ${month.slice(0, 4)}`}>
        <div className="cal">
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
            <div key={i} className="dow" aria-hidden="true">
              {d}
            </div>
          ))}
          {cells.map((d, i) => {
            if (!d) return <span key={`o${i}`} className="d out" aria-hidden="true" />;
            const its = byDate.get(d) ?? [];
            const kinds = [...new Set(its.map((x) => x.kind))];
            const cls = [d < today ? "past" : "", d === today ? "today" : ""].filter(Boolean).join(" ");
            return (
              <Link
                key={d}
                href={`/calendar?m=${month.slice(0, 7)}&d=${d}`}
                className={cls}
                aria-current={d === selected ? "date" : undefined}
                aria-label={`${fmtShort(d)}${its.length ? `, ${plural(its.length, "item")}` : ""}`}
              >
                <span>{Number(d.slice(8))}</span>
                <span className="mk" aria-hidden="true">
                  {kinds.map((k) => (
                    <i key={k} className={MARK[k]} />
                  ))}
                </span>
              </Link>
            );
          })}
        </div>
        <div className="legend">
          <span>
            <span className="mk">
              <i className="t" />
            </span>
            Task due
          </span>
          <span>
            <span className="mk">
              <i className="g" />
            </span>
            Goal deadline
          </span>
          <span>
            <span className="mk">
              <i className="c" />
            </span>
            Commitment
          </span>
        </div>
      </section>

      <div className="sec">
        {fmtRelative(selected, today)} <span>{plural(dayItems.length, "item")}</span>
      </div>
      <section className="card flush" aria-label={`Items on ${fmtShort(selected)}`}>
        {dayItems.length ? (
          dayItems.map((it) => (
            <div key={`${it.kind}-${it.id}`} className="ag">
              <span className="when">
                {it.time ? fmt12h(it.time) : "All day"}
                {it.endTime ? (
                  <>
                    <br />
                    <span className="t3">to {fmt12h(it.endTime)}</span>
                  </>
                ) : null}
              </span>
              <div>
                <div className="what" style={it.done ? { textDecoration: "line-through", color: "var(--ink3)" } : undefined}>
                  {it.title}
                </div>
                <Kind item={it} />
              </div>
              {it.kind === "commitment" ? (
                <div className="row" style={{ gap: 4 }}>
                  <Link className="iconbtn" href={`/calendar?m=${month.slice(0, 7)}&d=${selected}&edit=${it.id}#commitment`} aria-label={`Edit ${it.title}`} style={{ width: 34, height: 34 }}>
                    <Icon name="edit" size={15} />
                  </Link>
                  <form action={deleteCommitmentAction}>
                    <input type="hidden" name="id" value={it.id} />
                    <input type="hidden" name="back" value={`/calendar?m=${month.slice(0, 7)}&d=${selected}`} />
                    <button type="submit" className="iconbtn danger" aria-label={`Delete ${it.title}`} style={{ width: 34, height: 34 }}>
                      <Icon name="trash" size={15} />
                    </button>
                  </form>
                </div>
              ) : it.kind === "task" ? (
                <Link className="iconbtn" href={`/plan/task/${it.id}`} aria-label={`Open task ${it.title}`} style={{ width: 34, height: 34 }}>
                  <Icon name="chev" size={15} />
                </Link>
              ) : (
                <Link className="iconbtn" href="/plan/goals" aria-label={`Open goals`} style={{ width: 34, height: 34 }}>
                  <Icon name="chev" size={15} />
                </Link>
              )}
            </div>
          ))
        ) : (
          <p className="sm t3" style={{ padding: "12px 0" }}>
            Nothing on this day. Gym sessions live in Train, not here.
          </p>
        )}
      </section>

      <div className="sec">Coming up</div>
      <section className="card flush" aria-label="Coming up">
        {upcoming.length ? (
          upcoming.map((it) => (
            <div key={`u-${it.kind}-${it.id}`} className="ag">
              <span className="when">{fmtShort(it.date)}</span>
              <div>
                <div className="what">{it.title}</div>
                <span className="kind">
                  <span className="mk" aria-hidden="true">
                    <i className={MARK[it.kind]} />
                  </span>
                  {it.detail}
                  {it.time ? ` · ${fmt12h(it.time)}` : ""}
                </span>
              </div>
              <span />
            </div>
          ))
        ) : (
          <p className="sm t3" style={{ padding: "12px 0" }}>
            Nothing in the next six weeks.
          </p>
        )}
      </section>

      <div className="sec" id="commitment">
        {editing ? "Edit commitment" : "Add a commitment"}
      </div>
      <CommitmentForm key={editing?.id ?? selected} date={selected} commitment={editing} />
    </main>
  );
}
