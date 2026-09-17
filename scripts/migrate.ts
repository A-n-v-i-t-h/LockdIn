// npm run db:migrate            → the database in DATABASE_URL (or local PGlite)
// npm run db:migrate -- --print → print the SQL instead (for the Supabase SQL editor)
import { loadEnv } from "./env";
import { migrate, openDb } from "../src/lib/db";
import { LOCK_DOWN_SQL, MIGRATIONS } from "../src/lib/db/migrations";

async function main() {
  loadEnv();
  if (process.argv.includes("--print")) {
    for (const m of MIGRATIONS) console.log(`-- ${m.version}\n${m.sql}\n`);
    console.log(`-- lock down\n${LOCK_DOWN_SQL}`);
    return;
  }
  const url = process.env.DATABASE_URL;
  const db = await openDb({ url, dataDir: process.env.PGLITE_DIR || ".data/pglite" });
  try {
    const applied = await migrate(db);
    console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Schema is up to date.");
    console.log(`Database: ${db.kind === "postgres" ? "Postgres (DATABASE_URL)" : "local PGlite"}`);
  } finally {
    await db.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
