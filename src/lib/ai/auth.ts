import { timingSafeEqual } from "node:crypto";
import type { Db } from "@/lib/db";
import { normaliseEmail } from "@/lib/auth/users";

/**
 * The AI coach's own credential: AI_COACH_TOKEN (32+ characters), acting for the
 * account AI_COACH_EMAIL. It opens only /api/ai/*, never a login session.
 */
export function aiAuthorised(req: Request): boolean {
  const secret = process.env.AI_COACH_TOKEN;
  if (!secret || secret.length < 32) return false;
  const a = Buffer.from(req.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function aiUserId(db: Db): Promise<string | null> {
  const email = process.env.AI_COACH_EMAIL;
  if (!email) return null;
  const rows = await db.query<{ id: string }>("select id from app_users where lower(email) = $1", [normaliseEmail(email)]);
  return rows[0]?.id ?? null;
}
