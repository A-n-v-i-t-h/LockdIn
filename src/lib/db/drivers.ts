// Two drivers behind one interface. Both are configured to return the same JS
// shapes: dates as "YYYY-MM-DD", timestamps as ISO strings, numerics as numbers.
import type { Db, Queryable, Row } from "./types";

const OID = { INT8: 20, NUMERIC: 1700, DATE: 1082, TIMESTAMPTZ: 1184, TIMESTAMP: 1114, JSON: 114, JSONB: 3802 } as const;

const identity = (x: string) => x;

/** Postgres renders timestamptz as "2026-09-17 09:40:12.123+00"; make it ISO 8601. */
export function pgTimestampToIso(x: string): string {
  let s = x.replace(" ", "T");
  if (/[+-]\d\d$/.test(s)) s += ":00";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new Error(`Unparseable timestamp from database: ${x}`);
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// PGlite (local development and tests)
// ---------------------------------------------------------------------------

export async function openPglite(dataDir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  if (dataDir && !dataDir.startsWith("memory://")) {
    const fs = await import("node:fs");
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const pg = new PGlite({
    dataDir: dataDir && !dataDir.startsWith("memory://") ? dataDir : undefined,
    parsers: {
      [OID.DATE]: identity,
      [OID.TIMESTAMPTZ]: pgTimestampToIso,
      [OID.NUMERIC]: Number,
      [OID.INT8]: Number,
    },
  });
  await pg.waitReady;
  await pg.exec("set timezone to 'UTC'");

  // PGlite is a single connection. Serialise work so a transaction never
  // interleaves with statements from another request.
  let chain: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn);
    chain = run.catch(() => undefined);
    return run;
  };

  const direct: Queryable = {
    async query<T = Row>(text: string, params: readonly unknown[] = []) {
      const res = await pg.query<T>(text, params as unknown[]);
      return res.rows;
    },
  };

  return {
    kind: "pglite",
    query: (text, params) => exclusive(() => direct.query(text, params)),
    tx: (fn) =>
      exclusive(() =>
        pg.transaction(async (t) =>
          fn({
            async query<T = Row>(text: string, params: readonly unknown[] = []) {
              const res = await t.query<T>(text, params as unknown[]);
              return res.rows;
            },
          }),
        ),
      ),
    close: () => pg.close(),
  };
}

// ---------------------------------------------------------------------------
// postgres.js (production: Supabase pooler, transaction mode)
// ---------------------------------------------------------------------------

export async function openPostgres(url: string): Promise<Db> {
  const { default: postgres } = await import("postgres");
  const sql = postgres(url, {
    prepare: false, // required by the Supabase transaction pooler
    max: 3,
    idle_timeout: 20,
    connect_timeout: 15,
    ssl: /localhost|127\.0\.0\.1/.test(url) ? false : "require",
    connection: { TimeZone: "UTC" },
    types: {
      dateText: { to: OID.DATE, from: [OID.DATE], serialize: (x: unknown) => String(x), parse: identity },
      tsIso: {
        to: OID.TIMESTAMPTZ,
        from: [OID.TIMESTAMPTZ, OID.TIMESTAMP],
        serialize: (x: unknown) => (x instanceof Date ? x.toISOString() : String(x)),
        parse: pgTimestampToIso,
      },
      numeric: { to: OID.NUMERIC, from: [OID.NUMERIC], serialize: (x: unknown) => String(x), parse: Number },
      int8: { to: OID.INT8, from: [OID.INT8], serialize: (x: unknown) => String(x), parse: Number },
      // Callers pass JSON text to `$n::jsonb` (as PGlite expects). postgres.js would
      // JSON.stringify it again and store a JSON string instead of the object.
      json: {
        to: OID.JSONB,
        from: [OID.JSON, OID.JSONB],
        serialize: (x: unknown) => (typeof x === "string" ? x : JSON.stringify(x)),
        parse: (x: string) => JSON.parse(x),
      },
    },
  });

  type Unsafe = { unsafe: (text: string, params?: never[]) => PromiseLike<unknown> };
  const wrap = (s: Unsafe): Queryable => ({
    async query<T = Row>(text: string, params: readonly unknown[] = []) {
      const rows = await s.unsafe(text, params as never[]);
      return rows as unknown as T[];
    },
  });

  const base = wrap(sql);
  return {
    kind: "postgres",
    query: base.query,
    tx: async (fn) => (await sql.begin((t) => fn(wrap(t as unknown as Unsafe)))) as never,
    close: () => sql.end({ timeout: 5 }),
  };
}
