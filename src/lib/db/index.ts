import { openPglite, openPostgres } from "./drivers";
import { LOCK_DOWN_SQL, MIGRATIONS } from "./migrations";
import type { Db, Queryable } from "./types";

export type { Db, Queryable, Row } from "./types";

const globalForDb = globalThis as unknown as { __lockdinDb?: Promise<Db> };

function isPostgresUrl(url: string | undefined): url is string {
  return !!url && /^postgres(ql)?:\/\//.test(url);
}

/** Opens a database from explicit settings (used by scripts and tests). */
export async function openDb(opts: { url?: string; dataDir?: string } = {}): Promise<Db> {
  if (isPostgresUrl(opts.url)) return openPostgres(opts.url);
  const db = await openPglite(opts.dataDir ?? "memory://");
  await migrate(db);
  return db;
}

/** The app's shared connection. Local development uses PGlite and migrates itself. */
export function getDb(): Promise<Db> {
  if (!globalForDb.__lockdinDb) {
    const url = process.env.DATABASE_URL;
    if (!isPostgresUrl(url) && process.env.VERCEL) {
      throw new Error("DATABASE_URL must be a Postgres connection string on Vercel.");
    }
    globalForDb.__lockdinDb = (async () => {
      if (isPostgresUrl(url)) return openPostgres(url);
      const db = await openPglite(process.env.PGLITE_DIR || ".data/pglite");
      await migrate(db);
      return db;
    })().catch((err) => {
      globalForDb.__lockdinDb = undefined;
      throw err;
    });
  }
  return globalForDb.__lockdinDb;
}

/** Applies pending migrations in order, each in its own transaction. Returns the versions applied. */
export async function migrate(db: Db): Promise<string[]> {
  await db.query(`create table if not exists schema_migrations (
    version text primary key,
    applied_at timestamptz not null default now()
  )`);
  const done = new Set(
    (await db.query<{ version: string }>("select version from schema_migrations")).map((r) => r.version),
  );
  const applied: string[] = [];
  for (const m of MIGRATIONS) {
    if (done.has(m.version)) continue;
    await db.tx(async (q) => {
      await execScript(q, m.sql);
      await q.query("insert into schema_migrations (version) values ($1)", [m.version]);
    });
    applied.push(m.version);
  }
  await execScript(db, LOCK_DOWN_SQL);
  return applied;
}

/**
 * Runs a multi-statement script. Statements are split on semicolons that end a
 * line, except inside `do $$ … $$` blocks, which are sent whole.
 */
async function execScript(q: Queryable, script: string): Promise<void> {
  for (const statement of splitSql(script)) await q.query(statement);
}

export function splitSql(script: string): string[] {
  const out: string[] = [];
  let buf = "";
  let inDollar = false;
  for (const line of script.split("\n")) {
    const trimmed = line.trim();
    if (!inDollar && trimmed.startsWith("--")) continue;
    buf += line + "\n";
    const dollars = (line.match(/\$\$/g) || []).length;
    if (dollars % 2 === 1) inDollar = !inDollar;
    if (!inDollar && trimmed.endsWith(";")) {
      const s = buf.trim();
      if (s && s !== ";") out.push(s);
      buf = "";
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}
