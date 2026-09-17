// A deterministic season of logs for tests and demos. Every morning the real
// coach runs; every evening a simulated athlete follows the card, succeeding or
// missing according to a hidden strength model. Nothing here is used by the app.
import type { Db } from "@/lib/db";
import { runCoach } from "@/lib/fitness/agent";
import { loadEngineInput } from "@/lib/fitness/agent";
import { DEFAULT_GYM, toLoadable } from "@/lib/fitness/equipment";
import { EXERCISES, loadModeOf } from "@/lib/fitness/program";
import {
  logSet,
  saveMeasurement,
  saveNutrition,
  saveWeighIn,
  startSession,
  finishSession,
} from "@/lib/fitness/repo";
import { targetOn } from "@/lib/fitness/nutrition";
import { addDays, diffDays, isFirstMondayOfMonth, toInstant, weekday } from "@/lib/time";
import { weekNumber } from "@/lib/fitness/schedule";
import type { CardSlot } from "@/lib/fitness/card";

/** Detrained estimated maxes (kg; pull-up is total load, per-dumbbell for DBs). */
const START_E1RM: Record<string, number> = {
  bench_press: 57, ohp: 38, pullup: 80, back_squat: 80, rdl: 92, deadlift: 100,
  incline_db_press: 22, cable_lateral_raise: 14, oh_cable_ext: 20, cable_kickback: 14, cable_crunch: 50,
  cs_row: 70, reverse_pec_deck: 45, incline_db_curl: 14, preacher_curl: 32, wrist_curl: 36, reverse_wrist_curl: 22,
  leg_press: 180, standing_leg_curl: 30, db_lateral_raise: 11, neck: 9, incline_smith_press: 55, db_skullcrusher: 15,
  cable_pressdown: 38, seated_cable_row: 70, face_pull: 32, face_away_curl: 15, hammer_curl: 17, spider_curl: 12,
  leg_extension: 60, lean_away_lateral: 11, lp_calf_raise: 120, smith_bench_press: 50,
  cs_tbar_row: 65, lat_pulldown: 70, db_rdl: 30, hack_squat: 110, trap_bar_deadlift: 100, iso_row: 70,
  bayesian_curl: 14, db_preacher_curl: 14, cable_rev_fly: 20, db_kickback: 10, oh_db_ext: 14, iso_shoulder_press: 50,
  btb_cable_lateral: 12, smith_calf_raise: 80, cross_body_hammer: 16, db_wrist_curl: 16, db_reverse_wrist_curl: 10,
};

export interface SimOptions {
  from?: string;
  until: string;
  seed?: number;
  /** Run the morning coach each day (true for realism; tests may turn it off for speed). */
  coach?: boolean;
}

export interface SimSummary {
  days: number;
  sessions: number;
  sets: number;
  runs: number;
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}

export async function simulateSeason(db: Db, userId: string, opts: SimOptions): Promise<SimSummary> {
  const rand = rng(opts.seed ?? 20260907);
  const from = opts.from ?? "2026-09-07";
  const e1rm: Record<string, number> = { ...START_E1RM };
  let hlrCapacity = 11;
  const summary: SimSummary = { days: 0, sessions: 0, sets: 0, runs: 0 };
  const rampDays: Record<number, number[]> = { 1: [1, 3, 5], 2: [1, 2, 4, 6] };

  const weightOn = (i: number, date: string): number => {
    // Ramp-in glycogen jump, a flat stretch (so the Monday review adds carbs), then a steady gain.
    let base: number;
    let noise = 0.6;
    if (date < "2026-09-21") base = 57.7 + 1.8 * (1 - Math.exp(-i / 4));
    else if (date < "2026-10-12") {
      base = 59.55;
      noise = 0.2;
    } else base = 59.6 + 0.038 * (i - 35);
    return Math.round((base + (rand() - 0.5) * noise) * 10) / 10;
  };

  const repsAt = (exKey: string, weight: number | null, bw: number, rir: number): number => {
    const ex = EXERCISES[exKey];
    const mode = loadModeOf(ex);
    if (mode === "none") return Math.max(0, Math.floor(hlrCapacity));
    const total = mode === "added" ? bw + (weight ?? 0) : (weight ?? 0);
    const max = e1rm[exKey] ?? 30;
    if (total <= 0) return 30;
    return Math.max(0, Math.min(30, Math.floor(30 * (max / total - 1)) - rir));
  };

  const grow = (exKey: string) => {
    e1rm[exKey] = (e1rm[exKey] ?? 30) * (1.006 + rand() * 0.004);
    if (EXERCISES[exKey]?.equipment === "none") hlrCapacity += 0.25;
  };

  for (let date = from; date <= opts.until; date = addDays(date, 1)) {
    const i = diffDays(date, "2026-09-07");
    summary.days++;
    const wd = weekday(date);
    const bw = weightOn(i, date);
    const at = (hhmm: string, bump = 0) => new Date(toInstant(date, hhmm).getTime() + bump * 1000).toISOString();

    // Morning: weigh-in and sleep (a few mornings are missed).
    const skipMorning = date > "2026-09-20" && rand() < 0.04;
    if (!skipMorning) {
      const bed = toInstant(addDays(date, -1), rand() < 0.2 ? "23:55" : "23:20");
      const sleepMin = 400 + Math.floor(rand() * 110);
      const wake = new Date(bed.getTime() + sleepMin * 60_000);
      await saveWeighIn(
        db,
        userId,
        {
          date,
          weight: bw,
          protocolOk: !(date === "2026-10-03"),
          bedAt: bed.toISOString(),
          wakeAt: wake.toISOString(),
        },
        at("07:05"),
      );
      if (wd === 1 && date >= "2026-09-21") {
        const weeks = Math.floor((i - 14) / 7);
        await saveMeasurement(db, userId, { date, kind: "waist", valueCm: Math.round((74 + weeks * 0.1) * 2) / 2 }, at("07:06"));
      }
      if (isFirstMondayOfMonth(date) && date >= "2026-10-01") {
        const m = (i - 28) / 30;
        const tape: Record<string, number> = { arm_r: 31.5 + m * 0.4, arm_l: 31 + m * 0.4, chest: 89 + m, thigh: 53 + m * 0.5, hips: 91.5 + m * 0.3, bideltoid: 47.5 + m * 0.4, neck: 34 + m * 0.2 };
        for (const [kind, v] of Object.entries(tape)) {
          await saveMeasurement(db, userId, { date, kind: kind as never, valueCm: Math.round(v * 10) / 10 }, at("07:07"));
        }
      }
    }

    // The coach runs after the check-in (or at the cron time if it was missed).
    let card = null;
    if (opts.coach !== false) {
      const { run } = await runCoach(db, userId, { trigger: skipMorning ? "cron" : "checkin", at: new Date(at(skipMorning ? "10:30" : "07:10")) });
      summary.runs++;
      card = run.output.card;
    } else {
      const { computeMorning } = await import("@/lib/fitness/engine");
      card = computeMorning(await loadEngineInput(db, userId, date, at("07:10"))).card;
    }

    // Evening: training.
    const week = weekNumber(date);
    const trainsToday =
      card.kind === "train" &&
      (week <= 2 ? rampDays[week]?.includes(wd) : rand() >= 0.05);
    if (trainsToday && card.session) {
      const session = await startSession(db, userId, { date, sessionKey: card.session.key, runId: null }, at("18:30"));
      let seq = 0;
      for (const slot of card.slots as CardSlot[]) {
        if (slot.optional && rand() < 0.5) continue;
        const useSub = !!slot.substitute && slot.status === "working" && rand() < 0.04;
        const exKey = useSub ? slot.substitute!.exercise.key : slot.exercise.key;
        const track = useSub ? slot.substitute!.track : slot.track;
        const ex = EXERCISES[exKey];
        const mode = loadModeOf(ex);
        const [lo, hi] = slot.reps;
        const log = async (setIndex: number, weight: number | null, reps: number) => {
          await logSet(
            db,
            userId,
            session,
            { slot: slot.slot, exercise: exKey, track, substituteFor: useSub ? slot.exercise.key : null, setIndex, weight: mode === "none" ? null : weight, reps },
            at("18:35", ++seq * 40),
          );
          summary.sets++;
        };

        if (slot.status === "rampin") {
          const w = mode === "none" ? null : Math.max(0, toLoadable(ex, (e1rm[exKey] ?? 30) * 0.5 - (mode === "added" ? bw : 0), gymDefault(), "down"));
          for (let s = 1; s <= slot.sets; s++) await log(s, w, lo);
        } else if (slot.status === "baseline_test") {
          // Work up in sets of 8; the last is the heaviest load with 2 reps left.
          const offset = mode === "added" ? bw : 0;
          let best = toLoadable(ex, (e1rm[exKey] ?? 30) * 0.55 - offset, gymDefault(), "down");
          for (let k = 0; k < 40; k++) {
            const next = toLoadable(ex, best + 2.5, gymDefault(), "nearest");
            if (next <= best || repsAt(exKey, next, bw, 0) < 10) break;
            best = next;
          }
          const ramp = [0.7, 0.85, 1].map((f) => Math.max(0, toLoadable(ex, (best + offset) * f - offset, gymDefault(), "down")));
          for (let s = 0; s < ramp.length; s++) await log(s + 1, ramp[s], 8);
        } else if (slot.status === "percent") {
          for (let s = 1; s <= slot.sets; s++) await log(s, slot.weight, 3);
        } else {
          let w: number | null = useSub ? slot.substitute!.weight : slot.weight;
          if (mode !== "none" && w === null) {
            // Choose a load that allows the bottom of the range.
            w = toLoadable(ex, (e1rm[exKey] ?? 30) / (1 + (hi + 1) / 30) - (mode === "added" ? bw : 0), gymDefault(), "down");
          }
          for (let s = 1; s <= slot.sets; s++) {
            const avail = repsAt(exKey, w, bw, Math.floor(rand() * 2)) - Math.floor((s - 1) / 2);
            const reps = Math.max(0, Math.min(hi, avail));
            await log(s, w, reps < lo && rand() < 0.3 ? lo : reps);
          }
        }
        grow(exKey);
      }
      await finishSession(db, userId, session.id, "", at("19:45"));
      summary.sessions++;
    }

    // Night: Cronometer totals (a few nights are missed).
    if (rand() >= 0.04) {
      const t = targetOn([], date);
      const kcalTarget = date >= "2026-10-12" ? t.kcal + 100 : t.kcal;
      const kcal = Math.round(kcalTarget * (0.94 + rand() * 0.1));
      const protein = Math.round(112 + rand() * 18);
      const fat = Math.round(62 + rand() * 18);
      const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
      await saveNutrition(db, userId, { date, kcal, protein, carbs, fat }, at("22:00"));
    }
  }
  return summary;
}

function gymDefault() {
  // The simulation always uses the default gym; settings are not changed.
  return DEFAULT_GYM;
}
