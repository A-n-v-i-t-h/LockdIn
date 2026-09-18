import "server-only";
import { getDb } from "@/lib/db";
import { ensureTodayRun } from "@/lib/fitness/agent";
import { computeBests } from "@/lib/fitness/bests";
import { computeMorning, type MorningOutput } from "@/lib/fitness/engine";
import { makeBodyweightLookup } from "@/lib/fitness/progression";
import { loadEngineInput } from "@/lib/fitness/agent";
import {
  getSession,
  loadMeasurements,
  loadNutrition,
  loadSets,
  loadSettings,
  loadTargets,
  loadWeighIns,
  sessionSets,
  type CoachRun,
} from "@/lib/fitness/repo";
import { CURRENT_RULES } from "@/lib/fitness/rules";
import { loggingStreak } from "@/lib/fitness/streak";
import { targetOn } from "@/lib/fitness/nutrition";
import { addDays, dayPart, localDate, logicalDate, now } from "@/lib/time";
import { listAiNotes, listProposals } from "@/lib/ai/coach";

export async function fitnessBasics(userId: string, at: Date = now()) {
  const db = await getDb();
  const today = localDate(at);
  const [weighIns, nutrition, sets, measurements, targets, settings] = await Promise.all([
    loadWeighIns(db, userId),
    loadNutrition(db, userId),
    loadSets(db, userId),
    loadMeasurements(db, userId),
    loadTargets(db, userId),
    loadSettings(db, userId),
  ]);
  const bodyweight = makeBodyweightLookup(weighIns);
  const bests = computeBests(sets, bodyweight, CURRENT_RULES);
  const streak = loggingStreak({
    today,
    weighInDates: weighIns.filter((w) => w.weight !== null).map((w) => w.date),
    nutritionDates: nutrition.map((n) => n.date),
  });
  return { db, today, weighIns, nutrition, sets, measurements, targets, settings, bodyweight, bests, streak };
}

export async function homeView(userId: string) {
  const at = now();
  const base = await fitnessBasics(userId, at);
  const run: CoachRun = await ensureTodayRun(base.db, userId, at);
  const nightDate = logicalDate(at);
  const session = await getSession(base.db, userId, base.today);
  const logged = session ? await sessionSets(base.db, userId, session.id) : [];
  const [notes, pending] = await Promise.all([listAiNotes(base.db, userId, 1), listProposals(base.db, userId, { pending: true })]);
  return {
    ...base,
    aiNote: notes[0]?.date === base.today ? notes[0] : null,
    aiPending: pending.length,
    at,
    part: dayPart(at),
    run,
    out: run.output as MorningOutput,
    nightDate,
    todayWeigh: base.weighIns.find((w) => w.date === base.today) ?? null,
    tonight: base.nutrition.find((n) => n.date === nightDate) ?? null,
    tonightTarget: targetOn(base.targets, nightDate),
    session,
    loggedSets: logged.filter((s) => !s.isWarmup).length,
  };
}

/**
 * What tomorrow's card will say for today's lifts, computed now from the log.
 * The morning run confirms it; nothing is stored here.
 */
export async function previewNextCard(userId: string, date: string) {
  const db = await getDb();
  const input = await loadEngineInput(db, userId, addDays(date, 1), now().toISOString());
  return computeMorning(input);
}

/**
 * The card a past day would have had, for days with no stored coach run (before the
 * app was in use, or a day the app wasn't opened and the cron failed). Computed from
 * the log as it is now and not stored, so it never enters the run history.
 */
export async function plannedCard(userId: string, date: string): Promise<MorningOutput["card"] | null> {
  const db = await getDb();
  try {
    return computeMorning(await loadEngineInput(db, userId, date, now().toISOString())).card;
  } catch (e) {
    console.error("plannedCard failed", e);
    return null;
  }
}

export async function trainView(userId: string) {
  const at = now();
  const db = await getDb();
  const today = localDate(at);
  const run = await ensureTodayRun(db, userId, at);
  const session = await getSession(db, userId, today);
  const logged = session ? await sessionSets(db, userId, session.id) : [];
  const settings = await loadSettings(db, userId);
  return { today, run, out: run.output, session, logged, settings };
}
