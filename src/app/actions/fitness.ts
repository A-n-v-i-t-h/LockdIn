"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireUser, getCurrentUser } from "@/lib/auth/session";
import { refreshCoach, replayHistory, runCoach } from "@/lib/fitness/agent";
import { DEFAULT_GYM, sanitiseGym } from "@/lib/fitness/equipment";
import { dailyFeedback, mealLineNotes, targetOn, type FeedbackLine } from "@/lib/fitness/nutrition";
import { savePhoto, deletePhoto, PHOTO_KINDS, type PhotoKind } from "@/lib/fitness/photos";
import { EXERCISES, schemeForTrack } from "@/lib/fitness/program";
import {
  addDayChange,
  addOverride,
  finishSession,
  getSession,
  getSessionById,
  insertTargets,
  loadNutrition,
  loadSettings,
  loadTargets,
  logSet,
  MEASUREMENT_KINDS,
  removeSet,
  reopenSession,
  revokeDayChange,
  revokeOverride,
  saveMeasurement,
  saveNutrition,
  saveReview,
  saveSetting,
  saveWeighIn,
  sessionSets,
  startSession,
  type MeasurementKind,
} from "@/lib/fitness/repo";
import { CURRENT_RULES } from "@/lib/fitness/rules";
import { addDays, diffDays, fmtShort, isIsoDate, localDate, now } from "@/lib/time";
import { sleepInstants } from "@/lib/fitness/checkin";
import { dayPlan, weekStart } from "@/lib/fitness/schedule";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function str(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function num(form: FormData, key: string): number | null {
  const s = str(form, key).replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** Log dates can be today or up to 30 days back, never in the future. */
function checkLogDate(date: string, today: string): string | null {
  if (!isIsoDate(date)) return "Pick a valid date.";
  if (date > today) return "That date is in the future.";
  if (diffDays(today, date) > 30) return "Only the last 30 days can be edited here.";
  return null;
}

function refreshAll() {
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------------------
// Morning check-in
// ---------------------------------------------------------------------------

export interface CheckinState {
  error?: string;
}

export async function saveCheckinAction(_: CheckinState | undefined, form: FormData): Promise<CheckinState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Signed out. Sign in again." };
  const at = now();
  const today = localDate(at);
  const date = str(form, "date") || today;
  const dateProblem = checkLogDate(date, today);
  if (dateProblem) return { error: dateProblem };

  const weight = num(form, "weight");
  if (weight !== null && (Number.isNaN(weight) || weight < 25 || weight > 250)) return { error: "Weight should be between 25 and 250 kg." };
  const waist = num(form, "waist");
  if (waist !== null && (Number.isNaN(waist) || waist < 40 || waist > 200)) return { error: "Waist should be between 40 and 200 cm." };

  const bed = str(form, "bed");
  const wake = str(form, "wake");
  if ((bed && !TIME.test(bed)) || (wake && !TIME.test(wake))) return { error: "Enter sleep times as HH:MM." };
  if (weight === null && !(bed && wake) && waist === null) return { error: "Enter your weight, your sleep, or both." };

  const sleep = bed && wake ? sleepInstants(date, bed, wake) : { bedAt: null, wakeAt: null };
  const protocolOk = form.get("protocol") === "on";
  const db = await getDb();
  const stamp = at.toISOString();
  await db.tx(async (q) => {
    await saveWeighIn(
      q,
      user.id,
      { date, weight: weight === null ? null : Math.round(weight * 100) / 100, protocolOk, bedAt: sleep.bedAt, wakeAt: sleep.wakeAt },
      stamp,
    );
    if (waist !== null) await saveMeasurement(q, user.id, { date, kind: "waist", valueCm: Math.round(waist * 2) / 2 }, stamp);
  });
  await refreshCoach(db, user.id, date === today ? "checkin" : "edit", at);
  refreshAll();
  redirect("/?saved=checkin");
}

// ---------------------------------------------------------------------------
// Evening totals
// ---------------------------------------------------------------------------

export interface TonightState {
  error?: string;
  saved?: { date: string; feedback: FeedbackLine[]; meal: FeedbackLine[] };
}

export async function saveTonightAction(_: TonightState | undefined, form: FormData): Promise<TonightState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Signed out. Sign in again." };
  const at = now();
  const today = localDate(at);
  const date = str(form, "date");
  const dateProblem = checkLogDate(date, today);
  if (dateProblem) return { error: dateProblem };

  const kcal = num(form, "kcal");
  const protein = num(form, "protein");
  const carbs = num(form, "carbs");
  const fat = num(form, "fat");
  const values = { kcal, protein, carbs, fat };
  for (const [k, v] of Object.entries(values)) {
    if (v === null || Number.isNaN(v)) return { error: `Enter ${k === "kcal" ? "calories" : k} from Cronometer.` };
  }
  if (kcal! < 0 || kcal! > 10000) return { error: "Calories should be between 0 and 10,000." };
  if (protein! < 0 || protein! > 1000 || carbs! < 0 || carbs! > 2000 || fat! < 0 || fat! > 1000) {
    return { error: "Those macros look off. Check the Cronometer totals." };
  }
  const note = str(form, "note").slice(0, 1000);
  const photo = form.get("photo");

  const db = await getDb();
  const stamp = at.toISOString();
  try {
    await db.tx(async (q) => {
      await saveNutrition(
        q,
        user.id,
        { date, kcal: Math.round(kcal!), protein: Math.round(protein! * 10) / 10, carbs: Math.round(carbs! * 10) / 10, fat: Math.round(fat! * 10) / 10, note },
        stamp,
      );
      if (photo instanceof File && photo.size > 0) {
        const bytes = new Uint8Array(await photo.arrayBuffer());
        await savePhoto(q, user.id, { date, kind: "meal", bytes }, stamp);
      }
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't save." };
  }
  // Totals for an earlier day feed today's readiness gate, so the coach re-checks.
  if (date < today) await refreshCoach(db, user.id, "edit", at);
  refreshAll();

  const targets = await loadTargets(db, user.id);
  const day = (await loadNutrition(db, user.id)).find((n) => n.date === date) ?? null;
  return {
    saved: {
      date,
      feedback: dailyFeedback(day, targetOn(targets, date), CURRENT_RULES),
      meal: note ? mealLineNotes(note) : [],
    },
  };
}

// ---------------------------------------------------------------------------
// Workout logging
// ---------------------------------------------------------------------------

export interface LogSetInput {
  date: string;
  sessionKey: string;
  runId: string | null;
  slot: string;
  exercise: string;
  track: string;
  substituteFor: string | null;
  setIndex: number;
  weight: number | null;
  reps: number;
  plannedWeight: number | null;
  plannedReps: number | null;
}

export interface LoggedView {
  slot: string;
  setIndex: number;
  exercise: string;
  track: string;
  substituteFor: string | null;
  weight: number | null;
  reps: number;
}

export type LogResult = { ok: true; sessionId: string; sets: LoggedView[] } | { ok: false; error: string };

const toView = (s: Awaited<ReturnType<typeof sessionSets>>[number]): LoggedView => ({
  slot: s.slot,
  setIndex: s.setIndex,
  exercise: s.exercise,
  track: s.track,
  substituteFor: s.substituteFor,
  weight: s.weight,
  reps: s.reps,
});

const SESSION_KEYS = new Set(["push_a", "pull_a", "legs_q", "push_b", "pull_b", "legs_p", "free"]);

export async function logSetAction(input: LogSetInput): Promise<LogResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Signed out. Sign in again." };
  const at = now();
  const today = localDate(at);
  const dateProblem = checkLogDate(input.date, today);
  if (dateProblem) return { ok: false, error: dateProblem };
  if (!SESSION_KEYS.has(input.sessionKey)) return { ok: false, error: "Unknown session." };
  if (!EXERCISES[input.exercise] || !schemeForTrack(input.track)) return { ok: false, error: "Unknown exercise." };
  if (input.substituteFor !== null && !EXERCISES[input.substituteFor]) return { ok: false, error: "Unknown exercise." };
  const stamp = at.toISOString();
  const db = await getDb();
  try {
    const result = await db.tx(async (q) => {
      const runId = typeof input.runId === "string" && /^[0-9a-f-]{36}$/i.test(input.runId) ? input.runId : null;
      const session = await startSession(q, user.id, { date: input.date, sessionKey: input.sessionKey, runId }, stamp);
      await logSet(
        q,
        user.id,
        session,
        {
          slot: input.slot,
          exercise: input.exercise,
          track: input.track,
          substituteFor: input.substituteFor,
          setIndex: input.setIndex,
          weight: input.weight,
          reps: input.reps,
          plannedWeight: input.plannedWeight,
          plannedReps: input.plannedReps,
        },
        stamp,
      );
      return { sessionId: session.id, sets: (await sessionSets(q, user.id, session.id)).map(toView) };
    });
    if (input.date < today) await refreshCoach(db, user.id, "edit", at);
    return { ok: true, ...result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't save the set." };
  }
}

export async function removeSetAction(input: { date: string; slot: string; setIndex: number }): Promise<LogResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Signed out. Sign in again." };
  const at = now();
  const today = localDate(at);
  const dateProblem = checkLogDate(input.date, today);
  if (dateProblem) return { ok: false, error: dateProblem };
  if (!/^[0-9a-z]{1,4}$/.test(input.slot) || !Number.isInteger(input.setIndex)) return { ok: false, error: "Bad set." };
  const db = await getDb();
  const session = await getSession(db, user.id, input.date);
  if (!session) return { ok: false, error: "No session that day." };
  await removeSet(db, user.id, session.id, input.slot, input.setIndex, at.toISOString());
  if (input.date < today) await refreshCoach(db, user.id, "edit", at);
  return { ok: true, sessionId: session.id, sets: (await sessionSets(db, user.id, session.id)).map(toView) };
}

export async function finishSessionAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const db = await getDb();
  const session = await getSessionById(db, user.id, str(form, "sessionId"));
  if (!session) redirect("/train");
  await finishSession(db, user.id, session.id, str(form, "note"), now().toISOString());
  refreshAll();
  redirect(`/train?saved=session`);
}

export async function reopenSessionAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const db = await getDb();
  const session = await getSessionById(db, user.id, str(form, "sessionId"));
  if (session) await reopenSession(db, user.id, session.id);
  refreshAll();
  redirect(session && session.date !== localDate(now()) ? `/train/history/${session.date}` : "/train");
}

// ---------------------------------------------------------------------------
// Overrides
// ---------------------------------------------------------------------------

export interface OverrideState {
  error?: string;
}

export async function overrideLoadAction(_: OverrideState | undefined, form: FormData): Promise<OverrideState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Signed out. Sign in again." };
  const track = str(form, "track");
  if (!schemeForTrack(track)) return { error: "Unknown lift." };
  const weight = num(form, "weight");
  if (weight === null || Number.isNaN(weight) || weight < 0 || weight > 500) return { error: "Enter a load between 0 and 500 kg." };
  const reason = str(form, "reason").slice(0, 300);
  const at = now();
  const db = await getDb();
  await addOverride(
    db,
    user.id,
    { date: localDate(at), target: `track:${track}`, field: "weight", value: weight, reason, changeRef: str(form, "changeRef").slice(0, 64) || null },
    at.toISOString(),
  );
  await refreshCoach(db, user.id, "override", at);
  refreshAll();
  redirect("/coach?saved=override");
}

export async function overrideTargetsAction(_: OverrideState | undefined, form: FormData): Promise<OverrideState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Signed out. Sign in again." };
  const kcal = num(form, "kcal");
  const protein = num(form, "protein");
  const carbs = num(form, "carbs");
  const fat = num(form, "fat");
  if ([kcal, protein, carbs, fat].some((v) => v === null || Number.isNaN(v))) return { error: "Fill in all four targets." };
  if (kcal! < 800 || kcal! > 8000) return { error: "Calories should be between 800 and 8,000." };
  const computed = protein! * 4 + carbs! * 4 + fat! * 9;
  if (Math.abs(computed - kcal!) > 60) {
    return { error: `The macros add up to ${Math.round(computed)} kcal, not ${Math.round(kcal!)}. Make them match.` };
  }
  const at = now();
  const db = await getDb();
  await insertTargets(
    db,
    user.id,
    {
      effectiveDate: localDate(at),
      kcal: kcal!,
      protein: protein!,
      carbs: carbs!,
      fat: fat!,
      source: "override",
      reason: str(form, "reason").slice(0, 300) || "Set by hand",
    },
    at.toISOString(),
  );
  await refreshCoach(db, user.id, "override", at);
  refreshAll();
  redirect("/coach?saved=override");
}

export async function revokeOverrideAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = str(form, "id");
  const at = now();
  const db = await getDb();
  if (str(form, "kind") === "targets") {
    await db.query(
      `update nutrition_targets set superseded_at = $3::timestamptz where user_id = $1 and id = $2::uuid and source = 'override' and superseded_at is null`,
      [user.id, id, at.toISOString()],
    );
  } else {
    await revokeOverride(db, user.id, id, at.toISOString());
  }
  await refreshCoach(db, user.id, "override", at);
  refreshAll();
  redirect("/coach?saved=override");
}

// ---------------------------------------------------------------------------
// Measurements and photos
// ---------------------------------------------------------------------------

export interface MeasureState {
  error?: string;
  ok?: string;
}

export async function saveMeasurementsAction(_: MeasureState | undefined, form: FormData): Promise<MeasureState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Signed out. Sign in again." };
  const at = now();
  const today = localDate(at);
  const date = str(form, "date");
  const dateProblem = checkLogDate(date, today);
  if (dateProblem) return { error: dateProblem };
  const values: [MeasurementKind, number][] = [];
  for (const kind of MEASUREMENT_KINDS) {
    const v = num(form, kind);
    if (v === null) continue;
    if (Number.isNaN(v) || v < 10 || v > 300) return { error: `Check the ${kind.replace("_", " ")} value (cm).` };
    values.push([kind, Math.round(v * 10) / 10]);
  }
  const photos: { kind: PhotoKind; file: File }[] = [];
  for (const kind of PHOTO_KINDS) {
    const f = form.get(`photo_${kind}`);
    if (f instanceof File && f.size > 0) photos.push({ kind, file: f });
  }
  if (!values.length && !photos.length) return { error: "Nothing to save yet." };
  const db = await getDb();
  const stamp = at.toISOString();
  try {
    await db.tx(async (q) => {
      for (const [kind, v] of values) await saveMeasurement(q, user.id, { date, kind, valueCm: v }, stamp);
      for (const p of photos) {
        await savePhoto(q, user.id, { date, kind: p.kind, bytes: new Uint8Array(await p.file.arrayBuffer()) }, stamp);
      }
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't save." };
  }
  if (values.some(([k]) => k === "waist")) await refreshCoach(db, user.id, date === today ? "checkin" : "edit", at);
  refreshAll();
  return { ok: `Saved ${values.length} measurement${values.length === 1 ? "" : "s"}${photos.length ? ` and ${photos.length} photo${photos.length === 1 ? "" : "s"}` : ""}.` };
}

export async function deletePhotoAction(form: FormData): Promise<void> {
  const user = await requireUser();
  await deletePhoto(await getDb(), user.id, str(form, "id"), now().toISOString());
  refreshAll();
  redirect("/train/measure");
}

// ---------------------------------------------------------------------------
// Settings and coach controls
// ---------------------------------------------------------------------------

export async function saveGymAction(_: MeasureState | undefined, form: FormData): Promise<MeasureState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Signed out. Sign in again." };
  const plates = form.getAll("plates").map((p) => Number(p)).filter((p) => Number.isFinite(p) && p > 0);
  if (!plates.length) return { error: "Tick at least one plate size." };
  const bar = num(form, "barKg");
  const db = await getDb();
  const current = (await loadSettings(db, user.id)).gym;
  const gym = sanitiseGym({
    ...current,
    barKg: bar ?? DEFAULT_GYM.barKg,
    plates,
    dumbbellStep: num(form, "dumbbellStep") ?? current.dumbbellStep,
    dumbbellMin: num(form, "dumbbellMin") ?? current.dumbbellMin,
    dumbbellMax: num(form, "dumbbellMax") ?? current.dumbbellMax,
    cableStep: num(form, "cableStep") ?? current.cableStep,
    confirmed: {
      bar: form.get("confirm_bar") === "on",
      plates: form.get("confirm_plates") === "on",
      dumbbells: form.get("confirm_dumbbells") === "on",
      cable: form.get("confirm_cable") === "on",
    },
  });
  if (gym.dumbbellMin > gym.dumbbellMax) return { error: "The lightest dumbbell must be lighter than the heaviest." };
  const at = now();
  await saveSetting(db, user.id, "gym", gym, at.toISOString());
  await refreshCoach(db, user.id, "settings", at);
  refreshAll();
  return { ok: "Gym saved. Increments and plate diagrams now use it." };
}

export async function saveScheduleAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const day = Number(str(form, "buildRestDay"));
  if (!Number.isInteger(day) || day < 1 || day > 6) redirect("/settings");
  const at = now();
  const db = await getDb();
  await saveSetting(db, user.id, "schedule", { buildRestDay: day }, at.toISOString());
  await refreshCoach(db, user.id, "settings", at);
  refreshAll();
  redirect("/settings?saved=settings");
}

export async function runCoachAction(): Promise<void> {
  const user = await requireUser();
  const db = await getDb();
  await runCoach(db, user.id, { trigger: "manual", at: now() });
  refreshAll();
  redirect("/coach?saved=coach");
}

export async function runReplayAction(): Promise<void> {
  const user = await requireUser();
  const db = await getDb();
  const at = now();
  const result = await replayHistory(db, user.id, { before: addDays(localDate(at), 1) });
  await saveReview(db, user.id, { kind: "replay", date: localDate(at), runId: null, result }, at.toISOString());
  refreshAll();
  redirect("/coach?saved=replay#audit");
}

// ---------------------------------------------------------------------------
// Moving or skipping a day (holidays, missed days)
// ---------------------------------------------------------------------------

/** Days that can be changed: the last 30 (to fix a missed day) and the next 14 (a known holiday). */
function checkChangeDate(date: string, today: string): string | null {
  if (!isIsoDate(date)) return "Pick a valid date.";
  if (diffDays(today, date) > 30) return "Only the last 30 days can be changed.";
  if (diffDays(date, today) > 14) return "Only the next two weeks can be planned.";
  return null;
}

async function hasLoggedSets(db: Awaited<ReturnType<typeof getDb>>, userId: string, date: string): Promise<boolean> {
  const session = await getSession(db, userId, date);
  return !!session && (await sessionSets(db, userId, session.id)).length > 0;
}

function weekError(message: string, week: string): never {
  redirect(`/train/week?w=${week}&error=${encodeURIComponent(message)}`);
}

export async function moveDayAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const from = str(form, "date");
  const to = str(form, "toDate");
  const at = now();
  const today = localDate(at);
  const week = isIsoDate(from) ? weekStart(from) : weekStart(today);
  const bad = checkChangeDate(from, today) ?? checkChangeDate(to, today);
  if (bad) weekError(bad, week);
  if (from === to) weekError("Pick a different day to move it to.", week);
  if (weekStart(from) !== weekStart(to)) weekError("Sessions move within their own week (Monday to Sunday).", week);
  const db = await getDb();
  const { schedule } = await loadSettings(db, user.id);
  const plan = dayPlan(from, schedule);
  if (plan.kind !== "train") weekError(`${fmtShort(from)} has no session to move.`, week);
  if (dayPlan(to, schedule).phase === "pre") weekError("That day is before the program starts.", week);
  for (const d of [from, to]) {
    if (await hasLoggedSets(db, user.id, d)) weekError(`${fmtShort(d)} already has logged sets, so it stays as it is.`, week);
  }
  await addDayChange(db, user.id, { kind: "move", date: from, toDate: to, reason: str(form, "reason") }, at.toISOString());
  await refreshCoach(db, user.id, "settings", at);
  refreshAll();
  redirect(`/train/week?w=${week}&saved=moved`);
}

export async function skipDayAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const date = str(form, "date");
  const at = now();
  const today = localDate(at);
  const week = isIsoDate(date) ? weekStart(date) : weekStart(today);
  const bad = checkChangeDate(date, today);
  if (bad) weekError(bad, week);
  const db = await getDb();
  const { schedule } = await loadSettings(db, user.id);
  if (dayPlan(date, schedule).kind !== "train") weekError(`${fmtShort(date)} has no session to skip.`, week);
  if (await hasLoggedSets(db, user.id, date)) weekError(`${fmtShort(date)} already has logged sets, so it stays as it is.`, week);
  await addDayChange(db, user.id, { kind: "skip", date, reason: str(form, "reason") }, at.toISOString());
  await refreshCoach(db, user.id, "settings", at);
  refreshAll();
  redirect(`/train/week?w=${week}&saved=skipped`);
}

export async function undoDayChangeAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = str(form, "id");
  const week = str(form, "week");
  const at = now();
  const db = await getDb();
  const back = isIsoDate(week) ? week : weekStart(localDate(at));
  if (!/^[0-9a-f-]{36}$/i.test(id)) weekError("That change wasn't found.", back);
  const changes = (await loadSettings(db, user.id)).schedule.changes ?? [];
  const c = changes.find((x) => x.id === id);
  if (!c) weekError("That change wasn't found.", back);
  for (const d of c.kind === "move" ? [c.date, c.toDate] : [c.date]) {
    if (await hasLoggedSets(db, user.id, d)) weekError(`${fmtShort(d)} already has logged sets, so this change stays.`, back);
  }
  await revokeDayChange(db, user.id, id, at.toISOString());
  await refreshCoach(db, user.id, "settings", at);
  refreshAll();
  redirect(`/train/week?w=${back}&saved=undone`);
}
