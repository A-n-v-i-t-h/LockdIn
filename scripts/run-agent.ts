// npm run agent:run [-- --email you@example.com] [--replay] [--force]
// Runs the morning coach for one account (or all) against DATABASE_URL / local PGlite.
import { arg, loadEnv } from "./env";
import { migrate, openDb } from "../src/lib/db";
import { listUsers } from "../src/lib/auth/users";
import { replayHistory, runCoach } from "../src/lib/fitness/agent";

async function main() {
  loadEnv();
  const db = await openDb({ url: process.env.DATABASE_URL, dataDir: process.env.PGLITE_DIR || ".data/pglite" });
  try {
    if (db.kind === "pglite") await migrate(db);
    const email = arg("email")?.toLowerCase();
    const users = (await listUsers(db)).filter((u) => !email || u.email === email);
    if (!users.length) throw new Error("No matching account.");
    for (const u of users) {
      const { run, created } = await runCoach(db, u.id, { trigger: "manual", force: process.argv.includes("--force") });
      console.log(`${u.email}: ${run.runDate} rev ${run.revision} ${created ? "(new)" : "(unchanged)"}`);
      console.log(`  ${run.output.note.headline}`);
      for (const l of run.output.note.lines) console.log(`  - ${l.text}${l.rule ? ` [${l.rule}]` : ""}`);
      if (process.argv.includes("--replay")) {
        const r = await replayHistory(db, u.id);
        console.log(`  replay: ${r.checked} runs, ${r.divergent} divergent`);
      }
    }
  } finally {
    await db.close();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
