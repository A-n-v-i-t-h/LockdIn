import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { aiAuthorised, aiUserId } from "@/lib/ai/auth";
import { actAi, AiInputError } from "@/lib/ai/coach";
import { now } from "@/lib/time";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The AI coach's reply: note, notebook, and changes (applied within limits, proposed beyond them). */
export async function POST(req: Request) {
  if (!aiAuthorised(req)) return Response.json({ error: "Unauthorised" }, { status: 401 });
  const text = await req.text();
  if (text.length > 40_000) return Response.json({ error: "Body too large." }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const db = await getDb();
  const userId = await aiUserId(db);
  if (!userId) return Response.json({ error: "AI_COACH_EMAIL doesn't match an account." }, { status: 500 });
  try {
    const result = await actAi(db, userId, body, now());
    revalidatePath("/", "layout");
    return Response.json(result);
  } catch (e) {
    if (e instanceof AiInputError) return Response.json({ error: e.message }, { status: 400 });
    console.error("ai act failed", e);
    return Response.json({ error: "Failed to apply." }, { status: 500 });
  }
}
