import type { Db, Queryable } from "@/lib/db";
import { checkNewPassword, getDummyHash, hashPassword, verifyPassword } from "./password";

export interface User {
  id: string;
  email: string;
  displayName: string;
  sessionVersion: number;
}

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  session_version: number;
}

const toUser = (r: UserRow): User => ({
  id: r.id,
  email: r.email,
  displayName: r.display_name,
  sessionVersion: r.session_version,
});

export const LOCKOUT = {
  windowMinutes: 15,
  maxFailuresPerEmail: 5,
  maxFailuresPerIp: 20,
} as const;

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

export async function createUser(
  q: Queryable,
  input: { email: string; password: string; displayName: string },
): Promise<User> {
  const email = normaliseEmail(input.email);
  if (!isValidEmail(email)) throw new Error("Invalid email.");
  const check = checkNewPassword(input.password, email);
  if (!check.ok) throw new Error(check.problems.join(" "));
  const hash = await hashPassword(input.password);
  const rows = await q.query<UserRow>(
    `insert into app_users (email, display_name, password_hash)
     values ($1, $2, $3)
     returning id, email, display_name, password_hash, session_version`,
    [email, input.displayName.trim(), hash],
  );
  return toUser(rows[0]);
}

export async function getUserById(q: Queryable, id: string): Promise<User | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const rows = await q.query<UserRow>(
    "select id, email, display_name, password_hash, session_version from app_users where id = $1",
    [id],
  );
  return rows[0] ? toUser(rows[0]) : null;
}

export async function listUsers(q: Queryable): Promise<User[]> {
  const rows = await q.query<UserRow>(
    "select id, email, display_name, password_hash, session_version from app_users order by created_at",
  );
  return rows.map(toUser);
}

export type LoginResult =
  | { ok: true; user: User }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "locked"; retryAfterMinutes: number };

export async function attemptLogin(
  db: Db,
  input: { email: string; password: string; ip: string },
  at: Date = new Date(),
): Promise<LoginResult> {
  const email = normaliseEmail(input.email);
  const windowStart = new Date(at.getTime() - LOCKOUT.windowMinutes * 60_000).toISOString();

  // A successful sign-in clears the per-email count; the per-IP count only ages out.
  const [failures] = await db.query<{ by_email: number; by_ip: number; oldest: string | null }>(
    `with last_ok as (
       select coalesce(max(created_at), '-infinity'::timestamptz) as t
       from login_attempts where lower(email) = $1 and succeeded
     )
     select
       count(*) filter (where lower(a.email) = $1 and a.created_at > l.t)::int as by_email,
       count(*) filter (where a.ip = $2)::int as by_ip,
       min(a.created_at) as oldest
     from login_attempts a cross join last_ok l
     where not a.succeeded and a.created_at > $3::timestamptz
       and (lower(a.email) = $1 or a.ip = $2)`,
    [email, input.ip, windowStart],
  );
  if (failures.by_email >= LOCKOUT.maxFailuresPerEmail || failures.by_ip >= LOCKOUT.maxFailuresPerIp) {
    const oldest = failures.oldest ? new Date(failures.oldest).getTime() : at.getTime();
    const unlockAt = oldest + LOCKOUT.windowMinutes * 60_000;
    return { ok: false, reason: "locked", retryAfterMinutes: Math.max(1, Math.ceil((unlockAt - at.getTime()) / 60_000)) };
  }

  const rows = await db.query<UserRow>(
    "select id, email, display_name, password_hash, session_version from app_users where lower(email) = $1",
    [email],
  );
  const row = rows[0];
  // Always run the hash so an unknown email takes as long as a wrong password.
  const ok = await verifyPassword(input.password, row?.password_hash ?? (await getDummyHash()));
  const succeeded = ok && !!row;

  await db.query("insert into login_attempts (email, ip, succeeded, created_at) values ($1, $2, $3, $4::timestamptz)", [
    email,
    input.ip,
    succeeded,
    at.toISOString(),
  ]);
  if (!succeeded) return { ok: false, reason: "invalid" };
  return { ok: true, user: toUser(row) };
}

export type ChangePasswordResult = { ok: true; user: User } | { ok: false; error: string };

export async function changePassword(
  db: Db,
  userId: string,
  current: string,
  next: string,
): Promise<ChangePasswordResult> {
  const rows = await db.query<UserRow>(
    "select id, email, display_name, password_hash, session_version from app_users where id = $1",
    [userId],
  );
  const row = rows[0];
  if (!row) return { ok: false, error: "Account not found." };
  if (!(await verifyPassword(current, row.password_hash))) return { ok: false, error: "Current password is wrong." };
  if (current === next) return { ok: false, error: "Choose a password you haven't used here." };
  const check = checkNewPassword(next, row.email);
  if (!check.ok) return { ok: false, error: check.problems.join(" ") };
  const hash = await hashPassword(next);
  const updated = await db.query<UserRow>(
    `update app_users
       set password_hash = $2, session_version = session_version + 1, updated_at = now()
     where id = $1
     returning id, email, display_name, password_hash, session_version`,
    [userId, hash],
  );
  return { ok: true, user: toUser(updated[0]) };
}

/** Signs out every device: all older session cookies stop verifying. */
export async function bumpSessionVersion(q: Queryable, userId: string): Promise<number> {
  const rows = await q.query<{ session_version: number }>(
    "update app_users set session_version = session_version + 1, updated_at = now() where id = $1 returning session_version",
    [userId],
  );
  return rows[0].session_version;
}

export async function setDisplayName(q: Queryable, userId: string, name: string): Promise<void> {
  await q.query("update app_users set display_name = $2, updated_at = now() where id = $1", [
    userId,
    name.trim().slice(0, 60),
  ]);
}

/** Removes attempts older than a day; called opportunistically. */
export async function pruneLoginAttempts(q: Queryable, at: Date = new Date()): Promise<void> {
  await q.query("delete from login_attempts where created_at < $1::timestamptz", [
    new Date(at.getTime() - 86_400_000).toISOString(),
  ]);
}
