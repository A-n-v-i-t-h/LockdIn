import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/lib/db";
import { listUsers } from "@/lib/auth/users";
import { runCoach } from "@/lib/fitness/agent";
import { now } from "@/lib/time";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The morning fallback. Vercel Cron calls this once a day; it runs the coach
 * for every account. If the check-in already triggered today's run and nothing
 * changed since, the run is reused, so this is safe to call more than once.
 */
export async function GET(req: Request) {
  if (!authorised(req)) return Response.json({ error: "Unauthorised" }, { status: 401 });
  const db = await getDb();
  const at = now();
  const results: { user: string; runDate: string; revision: number; created: boolean }[] = [];
  const failures: { user: string; error: string }[] = [];
  for (const user of await listUsers(db)) {
    try {
      const { run, created } = await runCoach(db, user.id, { trigger: "cron", at });
      results.push({ user: user.id, runDate: run.runDate, revision: run.revision, created });
    } catch (e) {
      failures.push({ user: user.id, error: e instanceof Error ? e.message : String(e) });
      console.error("coach run failed", user.id, e);
    }
  }
  return Response.json({ ranAt: at.toISOString(), results, failures }, { status: failures.length ? 500 : 200 });
}
