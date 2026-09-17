import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession, verifySession } from "./token";
import { getUserById, type User } from "./users";

export async function startSession(user: User): Promise<void> {
  const token = await signSession({ sub: user.id, sv: user.sessionVersion });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  jar.delete({ name: SESSION_COOKIE, path: "/", secure: process.env.NODE_ENV === "production" });
}

/** The signed-in user for this request, or null. Checks the session version against the database. */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const jar = await cookies();
  const claims = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!claims) return null;
  const db = await getDb();
  const user = await getUserById(db, claims.sub);
  if (!user || user.sessionVersion !== claims.sv) return null;
  return user;
});

/** For pages and actions: the user, or a redirect to the login screen. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * The caller's IP for login rate limiting. On Vercel the platform sets
 * x-vercel-forwarded-for / x-real-ip itself, so those come first; a client can
 * put anything in x-forwarded-for. The per-email limit applies regardless.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const trusted = h.get("x-vercel-forwarded-for") || h.get("x-real-ip");
  if (trusted) return trusted.split(",")[0].trim().slice(0, 64);
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim().slice(0, 64);
  return "local";
}
