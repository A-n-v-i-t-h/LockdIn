// The calendar is internal: task deadlines, goal deadlines and commitments
// added by hand. Gym sessions never appear here.
import type { Queryable } from "@/lib/db";
import { addDays, daysInMonth, isIsoDate, monthStart, weekday } from "@/lib/time";
import type { Goal } from "./goals";
import type { Task } from "./tasks";

export interface Commitment {
  id: string;
  title: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  location: string;
  notes: string;
}

export type ItemKind = "task" | "goal" | "commitment";

export interface CalendarItem {
  id: string;
  kind: ItemKind;
  date: string;
  time: string | null;
  endTime: string | null;
  title: string;
  detail: string;
  done: boolean;
}

export function calendarItems(from: string, to: string, tasks: Task[], goals: Goal[], commitments: Commitment[]): CalendarItem[] {
  const items: CalendarItem[] = [];
  for (const t of tasks) {
    if (!t.dueDate || t.dueDate < from || t.dueDate > to) continue;
    items.push({ id: t.id, kind: "task", date: t.dueDate, time: t.dueTime, endTime: null, title: t.title, detail: "Task due", done: !!t.doneAt });
  }
  for (const g of goals) {
    if (!g.targetDate || g.archivedAt || g.targetDate < from || g.targetDate > to) continue;
    items.push({ id: g.id, kind: "goal", date: g.targetDate, time: null, endTime: null, title: g.title, detail: "Goal deadline", done: !!g.achievedAt });
  }
  for (const c of commitments) {
    if (c.date < from || c.date > to) continue;
    items.push({
      id: c.id,
      kind: "commitment",
      date: c.date,
      time: c.startTime,
      endTime: c.endTime,
      title: c.title,
      detail: ["Commitment", c.location].filter(Boolean).join(" · "),
      done: false,
    });
  }
  const kindRank: Record<ItemKind, number> = { commitment: 0, task: 1, goal: 2 };
  return items.sort((a, b) =>
    a.date !== b.date
      ? a.date < b.date ? -1 : 1
      : (a.time ?? "99:99") !== (b.time ?? "99:99")
        ? (a.time ?? "99:99") < (b.time ?? "99:99") ? -1 : 1
        : kindRank[a.kind] - kindRank[b.kind],
  );
}

/** Monday-first grid for a month: nulls pad the first and last weeks. */
export function monthGrid(anyDay: string): (string | null)[] {
  const first = monthStart(anyDay);
  const n = daysInMonth(first);
  const lead = weekday(first) - 1;
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let i = 0; i < n; i++) cells.push(addDays(first, i));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function validateCommitment(input: Omit<Commitment, "id">): string | null {
  if (!input.title.trim()) return "Give it a title.";
  if (input.title.length > 200) return "Keep the title under 200 characters.";
  if (!isIsoDate(input.date)) return "Pick a date.";
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (input.startTime && !time.test(input.startTime)) return "That start time isn't valid.";
  if (input.endTime && !time.test(input.endTime)) return "That end time isn't valid.";
  if (input.endTime && !input.startTime) return "An end time needs a start time.";
  if (input.endTime && input.startTime && input.endTime <= input.startTime) return "The end has to be after the start.";
  return null;
}

interface Row { id: string; title: string; date: string; start_time: string | null; end_time: string | null; location: string; notes: string }
const toCommitment = (r: Row): Commitment => ({
  id: r.id, title: r.title, date: r.date, startTime: r.start_time, endTime: r.end_time, location: r.location, notes: r.notes,
});

export async function listCommitments(q: Queryable, userId: string, from: string, to: string): Promise<Commitment[]> {
  const rows = await q.query<Row>(
    `select id, title, date, start_time, end_time, location, notes from commitments
     where user_id = $1 and deleted_at is null and date between $2::date and $3::date
     order by date, start_time nulls first`,
    [userId, from, to],
  );
  return rows.map(toCommitment);
}

export async function createCommitment(q: Queryable, userId: string, input: Omit<Commitment, "id">, at: string): Promise<string> {
  const problem = validateCommitment(input);
  if (problem) throw new Error(problem);
  const rows = await q.query<{ id: string }>(
    `insert into commitments (user_id, title, date, start_time, end_time, location, notes, created_at)
     values ($1, $2, $3::date, $4, $5, $6, $7, $8::timestamptz) returning id`,
    [userId, input.title.trim(), input.date, input.startTime, input.endTime, input.location.slice(0, 200), input.notes.slice(0, 2000), at],
  );
  return rows[0].id;
}

export async function updateCommitment(q: Queryable, userId: string, id: string, input: Omit<Commitment, "id">): Promise<void> {
  const problem = validateCommitment(input);
  if (problem) throw new Error(problem);
  await q.query(
    `update commitments set title = $3, date = $4::date, start_time = $5, end_time = $6, location = $7, notes = $8
     where user_id = $1 and id = $2::uuid and deleted_at is null`,
    [userId, id, input.title.trim(), input.date, input.startTime, input.endTime, input.location.slice(0, 200), input.notes.slice(0, 2000)],
  );
}

export async function deleteCommitment(q: Queryable, userId: string, id: string, at: string): Promise<void> {
  await q.query(`update commitments set deleted_at = $3::timestamptz where user_id = $1 and id = $2::uuid`, [userId, id, at]);
}

export async function getCommitment(q: Queryable, userId: string, id: string): Promise<Commitment | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const rows = await q.query<Row>(
    `select id, title, date, start_time, end_time, location, notes from commitments where user_id = $1 and id = $2 and deleted_at is null`,
    [userId, id],
  );
  return rows[0] ? toCommitment(rows[0]) : null;
}
