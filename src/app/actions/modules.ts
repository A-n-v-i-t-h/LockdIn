"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { getCurrentUser, requireUser } from "@/lib/auth/session";
import { localDate, now } from "@/lib/time";
import { createTask, deleteTask, setTaskDone, updateTask, validateTask, type Priority } from "@/lib/modules/tasks";
import { archiveHabit, createHabit, setHabitDay, updateHabit } from "@/lib/modules/habits";
import {
  addMilestone,
  createGoal,
  deleteMilestone,
  setGoalAchieved,
  setGoalArchived,
  setMilestoneDone,
  updateGoal,
  validateGoal,
  type GoalMetric,
} from "@/lib/modules/goals";
import { createCommitment, deleteCommitment, updateCommitment, validateCommitment } from "@/lib/modules/calendar";
import { createEntry, deleteEntry, updateEntry, validateEntry } from "@/lib/modules/journal";

export interface ModuleState {
  error?: string;
  ok?: string;
  nonce?: number;
}

function str(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function nullable(form: FormData, key: string): string | null {
  return str(form, key) || null;
}

function back(form: FormData, fallback: string): string {
  const to = str(form, "back");
  return /^\/(?!\/)[\w\-/?=&.%]*$/.test(to) ? to : fallback;
}

function done(path = "/") {
  revalidatePath(path === "/" ? "/" : path, "layout");
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export async function saveTaskAction(_: ModuleState | undefined, form: FormData): Promise<ModuleState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Signed out. Sign in again." };
  const v = validateTask({
    title: str(form, "title"),
    notes: str(form, "notes"),
    dueDate: nullable(form, "dueDate"),
    dueTime: nullable(form, "dueTime"),
    priority: (str(form, "priority") || "none") as Priority,
  });
  if (!v.ok) return { error: v.error };
  const db = await getDb();
  const id = str(form, "id");
  const at = now().toISOString();
  if (id) {
    if (!(await updateTask(db, user.id, id, v.value, at))) return { error: "That task no longer exists." };
  } else {
    await createTask(db, user.id, v.value, at);
  }
  done("/plan");
  if (id) redirect(back(form, "/plan"));
  return { ok: "Task added.", nonce: Date.now() };
}

export async function toggleTaskAction(form: FormData): Promise<void> {
  const user = await requireUser();
  await setTaskDone(await getDb(), user.id, str(form, "id"), str(form, "done") === "1", now().toISOString());
  done("/plan");
}

export async function deleteTaskAction(form: FormData): Promise<void> {
  const user = await requireUser();
  await deleteTask(await getDb(), user.id, str(form, "id"), now().toISOString());
  done("/plan");
  redirect(back(form, "/plan"));
}

// ---------------------------------------------------------------------------
// Habits
// ---------------------------------------------------------------------------

function days(form: FormData): number[] {
  return form.getAll("days").map((d) => Number(d));
}

export async function saveHabitAction(_: ModuleState | undefined, form: FormData): Promise<ModuleState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Signed out. Sign in again." };
  const name = str(form, "name");
  if (!name) return { error: "Give the habit a name." };
  const db = await getDb();
  const id = str(form, "id");
  try {
    if (id) await updateHabit(db, user.id, id, name, days(form));
    else await createHabit(db, user.id, name, days(form), now().toISOString());
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't save." };
  }
  done("/plan");
  if (id) redirect("/plan#habits");
  return { ok: "Habit added.", nonce: Date.now() };
}

export async function toggleHabitDayAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const date = str(form, "date");
  const at = now();
  if (date > localDate(at)) return;
  await setHabitDay(await getDb(), user.id, str(form, "habitId"), date, str(form, "done") === "1", at.toISOString());
  done("/plan");
}

export async function archiveHabitAction(form: FormData): Promise<void> {
  const user = await requireUser();
  await archiveHabit(await getDb(), user.id, str(form, "id"), now().toISOString());
  done("/plan");
  redirect("/plan#habits");
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

export async function createGoalAction(_: ModuleState | undefined, form: FormData): Promise<ModuleState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Signed out. Sign in again." };
  const kind = str(form, "kind") === "auto" ? "auto" : "manual";
  const metric = (str(form, "metric") || null) as GoalMetric | null;
  const target = str(form, "targetValue");
  const input = {
    title: str(form, "title"),
    category: str(form, "category") || "General",
    targetDate: nullable(form, "targetDate"),
    kind: kind as "manual" | "auto",
    metric: kind === "auto" ? metric : null,
    startValue: kind === "auto" ? (metric === "bodyweight_avg" ? 57.7 : 0) : null,
    targetValue: kind === "auto" && target ? Number(target) : null,
    notes: str(form, "notes"),
    milestones: str(form, "milestones").split("\n").map((m) => m.trim()).filter(Boolean),
  };
  const problem = validateGoal(input);
  if (problem) return { error: problem };
  await createGoal(await getDb(), user.id, input, now().toISOString());
  done("/plan/goals");
  return { ok: "Goal added.", nonce: Date.now() };
}

export async function updateGoalAction(_: ModuleState | undefined, form: FormData): Promise<ModuleState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Signed out. Sign in again." };
  const target = str(form, "targetValue");
  try {
    await updateGoal(await getDb(), user.id, str(form, "id"), {
      title: str(form, "title"),
      category: str(form, "category") || "General",
      targetDate: nullable(form, "targetDate"),
      notes: str(form, "notes"),
      targetValue: target ? Number(target) : null,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't save." };
  }
  done("/plan/goals");
  redirect("/plan/goals");
}

export async function addMilestoneAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const title = str(form, "title");
  if (title) await addMilestone(await getDb(), user.id, str(form, "goalId"), title, now().toISOString());
  done("/plan/goals");
}

export async function toggleMilestoneAction(form: FormData): Promise<void> {
  const user = await requireUser();
  await setMilestoneDone(await getDb(), user.id, str(form, "id"), str(form, "done") === "1", now().toISOString());
  done("/plan/goals");
}

export async function deleteMilestoneAction(form: FormData): Promise<void> {
  const user = await requireUser();
  await deleteMilestone(await getDb(), user.id, str(form, "id"));
  done("/plan/goals");
}

export async function goalStatusAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const db = await getDb();
  const at = now().toISOString();
  const id = str(form, "id");
  switch (str(form, "op")) {
    case "archive":
      await setGoalArchived(db, user.id, id, true, at);
      break;
    case "restore":
      await setGoalArchived(db, user.id, id, false, at);
      break;
    case "achieve":
      await setGoalAchieved(db, user.id, id, true, at);
      break;
    case "unachieve":
      await setGoalAchieved(db, user.id, id, false, at);
      break;
  }
  done("/plan/goals");
  redirect("/plan/goals");
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

export async function saveCommitmentAction(_: ModuleState | undefined, form: FormData): Promise<ModuleState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Signed out. Sign in again." };
  const input = {
    title: str(form, "title"),
    date: str(form, "date"),
    startTime: nullable(form, "startTime"),
    endTime: nullable(form, "endTime"),
    location: str(form, "location"),
    notes: str(form, "notes"),
  };
  const problem = validateCommitment(input);
  if (problem) return { error: problem };
  const db = await getDb();
  const id = str(form, "id");
  if (id) await updateCommitment(db, user.id, id, input);
  else await createCommitment(db, user.id, input, now().toISOString());
  done("/calendar");
  redirect(`/calendar?m=${input.date.slice(0, 7)}&d=${input.date}`);
}

export async function deleteCommitmentAction(form: FormData): Promise<void> {
  const user = await requireUser();
  await deleteCommitment(await getDb(), user.id, str(form, "id"), now().toISOString());
  done("/calendar");
  redirect(back(form, "/calendar"));
}

// ---------------------------------------------------------------------------
// Journal
// ---------------------------------------------------------------------------

export async function saveEntryAction(_: ModuleState | undefined, form: FormData): Promise<ModuleState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Signed out. Sign in again." };
  const input = {
    entryDate: str(form, "entryDate") || localDate(now()),
    body: typeof form.get("body") === "string" ? String(form.get("body")) : "",
    tags: form.getAll("tags").map(String),
  };
  const problem = validateEntry(input);
  if (problem) return { error: problem };
  const db = await getDb();
  const id = str(form, "id");
  const at = now().toISOString();
  if (id) {
    await updateEntry(db, user.id, id, input, at);
    done("/journal");
    redirect("/journal");
  }
  await createEntry(db, user.id, input, at);
  done("/journal");
  return { ok: "Saved to your journal.", nonce: Date.now() };
}

export async function deleteEntryAction(form: FormData): Promise<void> {
  const user = await requireUser();
  await deleteEntry(await getDb(), user.id, str(form, "id"), now().toISOString());
  done("/journal");
  redirect("/journal");
}
