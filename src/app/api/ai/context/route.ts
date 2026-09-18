import { getDb } from "@/lib/db";
import { aiAuthorised, aiUserId } from "@/lib/ai/auth";
import { aiContext } from "@/lib/ai/coach";
import { now } from "@/lib/time";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Everything the AI coach reads on a run: the brief, today's run, the log, its notebook. */
export async function GET(req: Request) {
  if (!aiAuthorised(req)) return Response.json({ error: "Unauthorised" }, { status: 401 });
  const db = await getDb();
  const userId = await aiUserId(db);
  if (!userId) return Response.json({ error: "AI_COACH_EMAIL doesn't match an account." }, { status: 500 });
  return Response.json(await aiContext(db, userId, now()), { headers: { "cache-control": "no-store" } });
}
