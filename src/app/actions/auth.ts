"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { clientIp, endSession, getCurrentUser, requireUser, startSession } from "@/lib/auth/session";
import { attemptLogin, bumpSessionVersion, changePassword, pruneLoginAttempts, setDisplayName } from "@/lib/auth/users";
import { now } from "@/lib/time";

export interface FormState {
  error?: string;
  ok?: string;
}

function safeNext(next: FormDataEntryValue | null): string {
  const s = typeof next === "string" ? next : "";
  // Only same-site relative paths; never "//evil.example".
  return /^\/(?!\/)[^\s\\]*$/.test(s) && !s.startsWith("/login") ? s : "/";
}

export async function loginAction(_: FormState | undefined, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };
  const db = await getDb();
  const result = await attemptLogin(db, { email, password, ip: await clientIp() }, now());
  if (Math.random() < 0.05) await pruneLoginAttempts(db, now());
  if (!result.ok) {
    return result.reason === "locked"
      ? { error: `Too many attempts. Try again in ${result.retryAfterMinutes} min.` }
      : { error: "That email and password don't match." };
  }
  await startSession(result.user);
  redirect(safeNext(form.get("next")));
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/login");
}

export async function logoutEverywhereAction(): Promise<void> {
  const user = await requireUser();
  const db = await getDb();
  await bumpSessionVersion(db, user.id);
  await endSession();
  redirect("/login");
}

export async function changePasswordAction(_: FormState | undefined, form: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Signed out. Sign in again." };
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  if (next !== confirm) return { error: "The new passwords don't match." };
  const db = await getDb();
  const result = await changePassword(db, user.id, current, next);
  if (!result.ok) return { error: result.error };
  await startSession(result.user);
  redirect("/settings?saved=password");
}

export async function renameAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const name = String(form.get("name") ?? "").trim();
  if (name.length > 0) await setDisplayName(await getDb(), user.id, name);
  redirect("/settings?saved=settings");
}
