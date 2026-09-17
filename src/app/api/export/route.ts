import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { localDate, now } from "@/lib/time";

export const dynamic = "force-dynamic";

const TABLES = [
  "weigh_ins",
  "nutrition_days",
  "measurements",
  "sessions",
  "set_logs",
  "overrides",
  "nutrition_targets",
  "settings",
  "coach_runs",
  "reviews",
  "tasks",
  "habits",
  "habit_logs",
  "goals",
  "goal_milestones",
  "commitments",
  "journal_entries",
] as const;

/** Every row the user owns, history included. Photos are listed without their bytes. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Not signed in.", { status: 401 });
  const db = await getDb();
  const data: Record<string, unknown[]> = {};
  for (const t of TABLES) {
    data[t] = await db.query(`select * from ${t} where user_id = $1`, [user.id]);
  }
  data.photos = await db.query(`select id, date, kind, mime, width, height, created_at, deleted_at from photos where user_id = $1`, [user.id]);
  const body = JSON.stringify(
    { exportedAt: now().toISOString(), account: { email: user.email, name: user.displayName }, data },
    null,
    2,
  );
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="lockdin-export-${localDate(now())}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
