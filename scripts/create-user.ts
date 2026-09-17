// npm run user:create -- --email you@example.com --name Anvith [--password …] [--out owner.credentials.local.txt]
// Creates the account (there is no public sign-up), seeds the plan's two goals and
// the log from D:\Dev\Gym\LOG.md, and writes the password to a gitignored file.
import fs from "node:fs";
import { arg, loadEnv } from "./env";
import { migrate, openDb } from "../src/lib/db";
import { createUser, normaliseEmail } from "../src/lib/auth/users";
import { generatePassword } from "../src/lib/auth/password";
import { seedPlanGoals } from "../src/lib/modules/goals";
import { seedFromGymLog } from "./seed-data";

async function main() {
  loadEnv();
  const email = arg("email");
  const name = arg("name") ?? "";
  if (!email) throw new Error("Pass --email.");
  const password = arg("password") ?? generatePassword();
  const out = arg("out") ?? "owner.credentials.local.txt";
  const db = await openDb({ url: process.env.DATABASE_URL, dataDir: process.env.PGLITE_DIR || ".data/pglite" });
  try {
    await migrate(db);
    const existing = await db.query<{ id: string }>("select id from app_users where lower(email) = $1", [normaliseEmail(email)]);
    if (existing.length) throw new Error(`An account for ${email} already exists.`);
    const user = await createUser(db, { email, password, displayName: name });
    const at = new Date().toISOString();
    await seedPlanGoals(db, user.id, at);
    if (!process.argv.includes("--no-seed")) {
      const seeded = await seedFromGymLog(db, user.id);
      console.log(`Seeded from the Gym log: ${seeded.join("; ")}`);
    }
    if (!arg("password")) {
      fs.writeFileSync(
        out,
        [
          "LockdIn login (keep this file private; it is gitignored)",
          `Email:    ${user.email}`,
          `Password: ${password}`,
          "Change it in Settings → Account after the first sign-in.",
          "",
        ].join("\n"),
        { mode: 0o600 },
      );
      console.log(`Created ${user.email}. Password written to ${out}.`);
    } else {
      console.log(`Created ${user.email}.`);
    }
  } finally {
    await db.close();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
