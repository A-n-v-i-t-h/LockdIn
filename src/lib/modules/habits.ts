// Habits keep a dated log, so streaks come from history and last week's ticks
// never show up as this week's (the Markus bug).
import type { Queryable } from "@/lib/db";
import { addDays, isIsoDate, localDate, weekday } from "@/lib/time";

export interface Habit {
  id: string;
  name: string;
  days: number[];
  sort: number;
  createdAt: string;
  archivedAt: string | null;
}

export const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];

export function cleanDays(days: unknown): number[] {
  const list = Array.isArray(days) ? days.map(Number).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7) : [];
  const unique = [...new Set(list)].sort();
  return unique.length ? unique : ALL_DAYS;
}

export function isScheduled(h: Pick<Habit, "days">, date: string): boolean {
  return h.days.includes(weekday(date));
}

/**
 * Streak over scheduled days only. Today counts once it's done; until then the
 * streak runs to the last scheduled day and isn't broken. Days before the habit
 * existed end the count.
 */
export function habitStreak(h: Pick<Habit, "days" | "createdAt">, doneDates: Set<string>, today: string): { current: number; best: number } {
  const created = localDate(new Date(h.createdAt));
  const earliest = [...doneDates].sort()[0];
  const start = earliest && earliest < created ? earliest : created;
  const scheduled = (d: string) => isScheduled(h, d);
  let current = 0;
  let d = today;
  if (!(scheduled(d) && doneDates.has(d))) d = addDays(d, -1);
  while (d >= start) {
    if (!scheduled(d)) {
      d = addDays(d, -1);
      continue;
    }
    if (!doneDates.has(d)) break;
    current++;
    d = addDays(d, -1);
  }
  let best = 0;
  let run = 0;
  for (let x = start; x <= today; x = addDays(x, 1)) {
    if (!scheduled(x)) continue;
    if (doneDates.has(x)) {
      run++;
      best = Math.max(best, run);
    } else if (x !== today) {
      run = 0;
    }
  }
  return { current, best: Math.max(best, current) };
}

interface Row { id: string; name: string; days: unknown; sort: number; created_at: string; archived_at: string | null }
const toHabit = (r: Row): Habit => ({ id: r.id, name: r.name, days: cleanDays(r.days), sort: r.sort, createdAt: r.created_at, archivedAt: r.archived_at });

export async function listHabits(q: Queryable, userId: string, includeArchived = false): Promise<Habit[]> {
  const rows = await q.query<Row>(
    `select id, name, days, sort, created_at, archived_at from habits
     where user_id = $1 and ($2::boolean or archived_at is null) order by sort, created_at`,
    [userId, includeArchived],
  );
  return rows.map(toHabit);
}

export async function doneDatesByHabit(q: Queryable, userId: string, from: string, to: string): Promise<Map<string, Set<string>>> {
  const rows = await q.query<{ habit_id: string; date: string }>(
    `select habit_id, date from habit_logs where user_id = $1 and done and date between $2::date and $3::date`,
    [userId, from, to],
  );
  const out = new Map<string, Set<string>>();
  for (const r of rows) {
    const set = out.get(r.habit_id) ?? new Set<string>();
    set.add(r.date);
    out.set(r.habit_id, set);
  }
  return out;
}

export async function createHabit(q: Queryable, userId: string, name: string, days: number[], at: string): Promise<string> {
  const clean = name.trim();
  if (!clean || clean.length > 120) throw new Error("A habit needs a name under 120 characters.");
  const [{ next }] = await q.query<{ next: number }>(`select coalesce(max(sort), 0) + 1 as next from habits where user_id = $1`, [userId]);
  const rows = await q.query<{ id: string }>(
    `insert into habits (user_id, name, days, sort, created_at) values ($1, $2, $3::jsonb, $4, $5::timestamptz) returning id`,
    [userId, clean, JSON.stringify(cleanDays(days)), next, at],
  );
  return rows[0].id;
}

export async function updateHabit(q: Queryable, userId: string, id: string, name: string, days: number[]): Promise<void> {
  const clean = name.trim();
  if (!clean || clean.length > 120) throw new Error("A habit needs a name under 120 characters.");
  await q.query(`update habits set name = $3, days = $4::jsonb where user_id = $1 and id = $2::uuid`, [
    userId,
    id,
    clean,
    JSON.stringify(cleanDays(days)),
  ]);
}

export async function archiveHabit(q: Queryable, userId: string, id: string, at: string): Promise<void> {
  await q.query(`update habits set archived_at = $3::timestamptz where user_id = $1 and id = $2::uuid`, [userId, id, at]);
}

export async function setHabitDay(q: Queryable, userId: string, habitId: string, date: string, done: boolean, at: string): Promise<void> {
  if (!isIsoDate(date)) throw new Error("Invalid date.");
  const owned = await q.query<{ id: string }>(`select id from habits where user_id = $1 and id = $2::uuid`, [userId, habitId]);
  if (!owned.length) throw new Error("Habit not found.");
  await q.query(
    `insert into habit_logs (user_id, habit_id, date, done, updated_at) values ($1, $2::uuid, $3::date, $4, $5::timestamptz)
     on conflict (habit_id, date) do update set done = excluded.done, updated_at = excluded.updated_at`,
    [userId, habitId, date, done, at],
  );
}
