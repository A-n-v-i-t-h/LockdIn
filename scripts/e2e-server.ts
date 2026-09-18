// Starts `next start` against a freshly seeded local database with the clock set
// to a chosen instant. Used by the Playwright config (and handy for demos).
//
//   tsx scripts/e2e-server.ts --port 3101 --now 2026-10-29T02:12:00Z --data .data/e2e-morning --until 2026-10-28
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { arg } from "./env";
import { migrate, openDb } from "../src/lib/db";
import { createUser } from "../src/lib/auth/users";
import { seedPlanGoals } from "../src/lib/modules/goals";
import { simulateSeason } from "../src/lib/demo/simulate";
import { seedDemoContent } from "../src/lib/demo/content";
import { localDate } from "../src/lib/time";
import { seedFromGymLog } from "./seed-data";

export const DEMO_USER = { email: "demo@lockdin.test", password: "stencil-plate-rack-42", name: "Anvith" };

async function main() {
  const port = arg("port") ?? "3101";
  const nowIso = arg("now") ?? "2026-10-29T02:12:00.000Z";
  const dataDir = path.resolve(arg("data") ?? `.data/e2e-${port}`);
  const until = arg("until") ?? localDate(new Date(new Date(nowIso).getTime() - 86_400_000));
  const empty = process.argv.includes("--empty");

  fs.rmSync(dataDir, { recursive: true, force: true });
  const db = await openDb({ dataDir });
  await migrate(db);
  const user = await createUser(db, { email: DEMO_USER.email, password: DEMO_USER.password, displayName: DEMO_USER.name });
  await seedPlanGoals(db, user.id, "2026-09-07T00:00:00.000Z");
  if (empty) {
    await seedFromGymLog(db, user.id);
  } else {
    await seedFromGymLog(db, user.id);
    const sim = await simulateSeason(db, user.id, { from: "2026-09-08", until });
    await seedDemoContent(db, user.id, localDate(new Date(nowIso)));
    console.log(`[e2e] seeded ${sim.days} days, ${sim.sessions} sessions, ${sim.sets} sets`);
  }
  await db.close();

  const child = spawn("npx", ["next", "start", "-p", port], {
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PGLITE_DIR: dataDir,
      DATABASE_URL: "",
      LOCKDIN_FAKE_NOW: nowIso,
      SESSION_SECRET: "e2e-session-secret-e2e-session-secret-0123",
      CRON_SECRET: "e2e-cron-secret-0123456789",
      AI_COACH_TOKEN: "e2e-ai-coach-token-0123456789abcdef",
      AI_COACH_EMAIL: DEMO_USER.email,
    },
  });
  const stop = () => child.kill();
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  child.on("exit", (code) => process.exit(code ?? 0));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
