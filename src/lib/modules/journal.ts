import type { Queryable } from "@/lib/db";
import { isIsoDate } from "@/lib/time";

export const JOURNAL_TAGS = ["Training", "Win", "Reflection", "Work", "Mood", "Food", "Sleep"];

export interface Entry {
  id: string;
  entryDate: string;
  body: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export function cleanTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const out = tags
    .map((t) => String(t).trim())
    .filter((t) => t.length > 0 && t.length <= 30)
    .map((t) => t.charAt(0).toUpperCase() + t.slice(1));
  return [...new Set(out)].slice(0, 8);
}

interface Row { id: string; entry_date: string; body: string; tags: unknown; created_at: string; updated_at: string }
const toEntry = (r: Row): Entry => ({
  id: r.id, entryDate: r.entry_date, body: r.body, tags: cleanTags(r.tags), createdAt: r.created_at, updatedAt: r.updated_at,
});

/** Escape LIKE wildcards so a search for "100%" means the literal text. */
export function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export async function listEntries(
  q: Queryable,
  userId: string,
  opts: { search?: string; tag?: string; limit?: number } = {},
): Promise<Entry[]> {
  const search = opts.search?.trim() || null;
  const tag = opts.tag?.trim() || null;
  const rows = await q.query<Row>(
    `select id, entry_date, body, tags, created_at, updated_at from journal_entries
     where user_id = $1 and deleted_at is null
       and ($2::text is null or body ilike $2::text escape '\\')
       and ($3::text is null or tags @> jsonb_build_array($3::text))
     order by entry_date desc, created_at desc
     limit $4::int`,
    [userId, search ? likePattern(search) : null, tag, opts.limit ?? 100],
  );
  return rows.map(toEntry);
}

export async function getEntry(q: Queryable, userId: string, id: string): Promise<Entry | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const rows = await q.query<Row>(
    `select id, entry_date, body, tags, created_at, updated_at from journal_entries where user_id = $1 and id = $2 and deleted_at is null`,
    [userId, id],
  );
  return rows[0] ? toEntry(rows[0]) : null;
}

export function validateEntry(input: { entryDate: string; body: string }): string | null {
  if (!isIsoDate(input.entryDate)) return "Pick a date.";
  if (!input.body.trim()) return "Write something first.";
  if (input.body.length > 20000) return "That entry is too long (20,000 characters max).";
  return null;
}

export async function createEntry(q: Queryable, userId: string, input: { entryDate: string; body: string; tags: string[] }, at: string): Promise<string> {
  const problem = validateEntry(input);
  if (problem) throw new Error(problem);
  const rows = await q.query<{ id: string }>(
    `insert into journal_entries (user_id, entry_date, body, tags, created_at, updated_at)
     values ($1, $2::date, $3, $4::jsonb, $5::timestamptz, $5::timestamptz) returning id`,
    [userId, input.entryDate, input.body.trim(), JSON.stringify(cleanTags(input.tags)), at],
  );
  return rows[0].id;
}

export async function updateEntry(q: Queryable, userId: string, id: string, input: { entryDate: string; body: string; tags: string[] }, at: string): Promise<void> {
  const problem = validateEntry(input);
  if (problem) throw new Error(problem);
  await q.query(
    `update journal_entries set entry_date = $3::date, body = $4, tags = $5::jsonb, updated_at = $6::timestamptz
     where user_id = $1 and id = $2::uuid and deleted_at is null`,
    [userId, id, input.entryDate, input.body.trim(), JSON.stringify(cleanTags(input.tags)), at],
  );
}

export async function deleteEntry(q: Queryable, userId: string, id: string, at: string): Promise<void> {
  await q.query(`update journal_entries set deleted_at = $3::timestamptz where user_id = $1 and id = $2::uuid`, [userId, id, at]);
}

export async function usedTags(q: Queryable, userId: string): Promise<string[]> {
  const rows = await q.query<{ tag: string }>(
    `select distinct jsonb_array_elements_text(tags) as tag from journal_entries where user_id = $1 and deleted_at is null`,
    [userId],
  );
  return [...new Set([...JOURNAL_TAGS, ...rows.map((r) => r.tag)])];
}
