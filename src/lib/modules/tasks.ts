import type { Queryable } from "@/lib/db";
import { isIsoDate } from "@/lib/time";

export type Priority = "high" | "medium" | "low" | "none";
export const PRIORITIES: Priority[] = ["high", "medium", "low", "none"];

export interface Task {
  id: string;
  title: string;
  notes: string;
  dueDate: string | null;
  dueTime: string | null;
  priority: Priority;
  doneAt: string | null;
  createdAt: string;
}

export type Bucket = "today" | "upcoming" | "someday" | "done";

export function bucketOf(t: Task, today: string): Bucket {
  if (t.doneAt) return "done";
  if (!t.dueDate) return "someday";
  return t.dueDate <= today ? "today" : "upcoming";
}

export function isOverdue(t: Task, today: string): boolean {
  return !t.doneAt && !!t.dueDate && t.dueDate < today;
}

const PRI_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2, none: 3 };

export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.dueDate !== b.dueDate) {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate < b.dueDate ? -1 : 1;
    }
    if (a.priority !== b.priority) return PRI_RANK[a.priority] - PRI_RANK[b.priority];
    const at = a.dueTime ?? "99:99";
    const bt = b.dueTime ?? "99:99";
    if (at !== bt) return at < bt ? -1 : 1;
    return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
  });
}

export interface TaskInput {
  title: string;
  notes?: string;
  dueDate?: string | null;
  dueTime?: string | null;
  priority?: Priority;
}

export function validateTask(input: TaskInput): { ok: true; value: Required<TaskInput> } | { ok: false; error: string } {
  const title = (input.title ?? "").trim();
  if (!title) return { ok: false, error: "Give the task a title." };
  if (title.length > 300) return { ok: false, error: "Keep the title under 300 characters." };
  const dueDate = input.dueDate ? input.dueDate : null;
  if (dueDate && !isIsoDate(dueDate)) return { ok: false, error: "That date isn't valid." };
  const dueTime = input.dueTime ? input.dueTime : null;
  if (dueTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(dueTime)) return { ok: false, error: "That time isn't valid." };
  if (dueTime && !dueDate) return { ok: false, error: "A time needs a date." };
  const priority = input.priority && PRIORITIES.includes(input.priority) ? input.priority : "none";
  return { ok: true, value: { title, notes: (input.notes ?? "").slice(0, 4000), dueDate, dueTime, priority } };
}

interface Row {
  id: string; title: string; notes: string; due_date: string | null; due_time: string | null;
  priority: Priority; done_at: string | null; created_at: string;
}
const toTask = (r: Row): Task => ({
  id: r.id, title: r.title, notes: r.notes, dueDate: r.due_date, dueTime: r.due_time,
  priority: r.priority, doneAt: r.done_at, createdAt: r.created_at,
});
const COLS = "id, title, notes, due_date, due_time, priority, done_at, created_at";

export async function listTasks(q: Queryable, userId: string): Promise<Task[]> {
  const rows = await q.query<Row>(`select ${COLS} from tasks where user_id = $1 and deleted_at is null`, [userId]);
  return sortTasks(rows.map(toTask));
}

export async function getTask(q: Queryable, userId: string, id: string): Promise<Task | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const rows = await q.query<Row>(`select ${COLS} from tasks where user_id = $1 and id = $2 and deleted_at is null`, [userId, id]);
  return rows[0] ? toTask(rows[0]) : null;
}

export async function createTask(q: Queryable, userId: string, input: Required<TaskInput>, at: string): Promise<string> {
  const rows = await q.query<{ id: string }>(
    `insert into tasks (user_id, title, notes, due_date, due_time, priority, created_at, updated_at)
     values ($1, $2, $3, $4::date, $5, $6, $7::timestamptz, $7::timestamptz) returning id`,
    [userId, input.title, input.notes, input.dueDate, input.dueTime, input.priority, at],
  );
  return rows[0].id;
}

export async function updateTask(q: Queryable, userId: string, id: string, input: Required<TaskInput>, at: string): Promise<boolean> {
  const rows = await q.query<{ id: string }>(
    `update tasks set title = $3, notes = $4, due_date = $5::date, due_time = $6, priority = $7, updated_at = $8::timestamptz
     where user_id = $1 and id = $2::uuid and deleted_at is null returning id`,
    [userId, id, input.title, input.notes, input.dueDate, input.dueTime, input.priority, at],
  );
  return rows.length > 0;
}

export async function setTaskDone(q: Queryable, userId: string, id: string, done: boolean, at: string): Promise<boolean> {
  const rows = await q.query<{ id: string }>(
    `update tasks set done_at = $3::timestamptz, updated_at = $4::timestamptz
     where user_id = $1 and id = $2::uuid and deleted_at is null returning id`,
    [userId, id, done ? at : null, at],
  );
  return rows.length > 0;
}

export async function deleteTask(q: Queryable, userId: string, id: string, at: string): Promise<boolean> {
  const rows = await q.query<{ id: string }>(
    `update tasks set deleted_at = $3::timestamptz where user_id = $1 and id = $2::uuid and deleted_at is null returning id`,
    [userId, id, at],
  );
  return rows.length > 0;
}
