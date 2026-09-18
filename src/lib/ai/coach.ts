// The AI coach's side of the app: what it reads (context) and what it may do (act).
// It works through the same append-only change tables as he does, marked author = 'ai',
// so every change is dated, visible on the Coach page, undoable, and replayable.
import { z } from "zod";
import type { Db, Queryable } from "@/lib/db";
import { ensureTodayRun, refreshCoach } from "@/lib/fitness/agent";
import { checkDayChange } from "@/lib/fitness/daychanges";
import { stepFor, toLoadable } from "@/lib/fitness/equipment";
import { targetOn } from "@/lib/fitness/nutrition";
import { exercise, schemeForTrack, SESSIONS } from "@/lib/fitness/program";
import {
  addDayChange,
  addOverride,
  insertTargets,
  loadDayChanges,
  loadMeasurements,
  loadNutrition,
  loadOverrides,
  loadSets,
  loadSettings,
  loadTargets,
  loadWeighIns,
} from "@/lib/fitness/repo";
import { weekPlan, weekStart } from "@/lib/fitness/schedule";
import type { TrackState } from "@/lib/fitness/progression";
import { listGoals } from "@/lib/modules/goals";
import { addDays, isIsoDate, localDate } from "@/lib/time";
import { AI_BRIEF, AI_LIMITS } from "./brief";

const HISTORY_DAYS = 56;

// ---------------------------------------------------------------------------
// What the AI sends
// ---------------------------------------------------------------------------

const reason = z.string().trim().min(1).max(300);
const isoDate = z.string().refine(isIsoDate, "Expected YYYY-MM-DD");

export const ChangeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("load"), track: z.string().max(80), weight: z.number().min(0).max(500), reason }),
  z.object({ type: z.literal("reps"), track: z.string().max(80), reps: z.array(z.number().int().min(1).max(30)).min(1).max(10), reason }),
  z.object({
    type: z.literal("targets"),
    kcal: z.number().int(),
    protein: z.number().min(0).max(400),
    carbs: z.number().min(0).max(1000),
    fat: z.number().min(0).max(300),
    reason,
  }),
  z.object({ type: z.literal("move"), date: isoDate, toDate: isoDate, reason }),
  z.object({ type: z.literal("skip"), date: isoDate, reason }),
  z.object({ type: z.literal("suggest"), text: z.string().trim().min(1).max(600) }),
]);
export type AiChange = z.infer<typeof ChangeSchema>;

export const ActSchema = z.object({
  date: isoDate,
  kind: z.enum(["daily", "weekly"]),
  note: z.string().trim().min(1).max(1500),
  notebook: z.string().max(5000).default(""),
  changes: z.array(ChangeSchema).max(AI_LIMITS.maxChangesPerRun).default([]),
  model: z.string().max(80).optional(),
});
export type AiAct = z.infer<typeof ActSchema>;

// ---------------------------------------------------------------------------
// Limits: which changes apply at once and which wait for his approval
// ---------------------------------------------------------------------------

export type Verdict = { kind: "apply" } | { kind: "review"; why: string } | { kind: "reject"; error: string };

export interface ClassifyContext {
  today: string;
  states: Record<string, TrackState>;
  gym: Parameters<typeof stepFor>[1];
  /** Calories in force 7 days before today and today. */
  kcalWeekAgo: number;
}

export function classifyChange(c: AiChange, ctx: ClassifyContext): Verdict {
  switch (c.type) {
    case "load": {
      const slot = schemeForTrack(c.track);
      if (!slot) return { kind: "reject", error: `Unknown track: ${c.track}` };
      const ex = exercise(slot.exercise);
      const st = ctx.states[c.track];
      const to = toLoadable(ex, c.weight, ctx.gym, "nearest");
      if (!st || st.status !== "active" || st.weight === null) return { kind: "review", why: "This lift has no working weight yet." };
      const step = stepFor(ex, ctx.gym);
      if (to - st.weight > step * AI_LIMITS.maxStepsUp + 1e-6) {
        return { kind: "review", why: `Up ${round(to - st.weight)} kg, more than one ${round(step)} kg step.` };
      }
      if (st.weight - to > (st.weight * AI_LIMITS.maxDropPct) / 100 + 1e-6) {
        return { kind: "review", why: `Down ${Math.round(((st.weight - to) / st.weight) * 100)}%, more than ${AI_LIMITS.maxDropPct}%.` };
      }
      return { kind: "apply" };
    }
    case "reps":
      return schemeForTrack(c.track) ? { kind: "apply" } : { kind: "reject", error: `Unknown track: ${c.track}` };
    case "targets": {
      const [lo, hi] = AI_LIMITS.kcalRange;
      if (c.kcal < lo || c.kcal > hi) return { kind: "reject", error: `Calories must be ${lo}–${hi}.` };
      const sum = c.protein * 4 + c.carbs * 4 + c.fat * 9;
      if (Math.abs(sum - c.kcal) > 60) return { kind: "reject", error: `Macros add up to ${Math.round(sum)} kcal, not ${c.kcal}.` };
      if (Math.abs(c.kcal - ctx.kcalWeekAgo) > AI_LIMITS.maxKcalMovePerWeek) {
        return { kind: "review", why: `${c.kcal - ctx.kcalWeekAgo > 0 ? "+" : ""}${c.kcal - ctx.kcalWeekAgo} kcal against a week ago, more than ${AI_LIMITS.maxKcalMovePerWeek}.` };
      }
      if (c.protein < AI_LIMITS.proteinFloor) return { kind: "review", why: `Protein below ${AI_LIMITS.proteinFloor} g.` };
      return { kind: "apply" };
    }
    case "move":
      return { kind: "apply" }; // checked against the week when applied
    case "skip":
      return { kind: "review", why: "Skipping a session always needs your yes." };
    case "suggest":
      return { kind: "review", why: "A suggestion for you to consider." };
  }
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Writes one change, authored by the AI. Returns the new row's id. Throws with a message if it can't apply. */
export async function applyChange(q: Queryable, userId: string, c: AiChange, today: string, at: string, approved = false): Promise<string | null> {
  const why = (r: string) => (approved ? `${r} (you approved)` : r);
  switch (c.type) {
    case "load":
      return addOverride(q, userId, { date: today, target: `track:${c.track}`, field: "weight", value: c.weight, reason: why(c.reason), author: "ai" }, at);
    case "reps":
      return addOverride(q, userId, { date: today, target: `track:${c.track}`, field: "reps", value: c.reps, reason: why(c.reason), author: "ai" }, at);
    case "targets":
      return insertTargets(
        q,
        userId,
        { effectiveDate: today, kcal: c.kcal, protein: c.protein, carbs: c.carbs, fat: c.fat, source: "override", reason: `AI coach: ${why(c.reason)}`, author: "ai" },
        at,
      );
    case "move":
    case "skip": {
      const input = c.type === "move" ? { kind: "move" as const, date: c.date, toDate: c.toDate } : { kind: "skip" as const, date: c.date };
      const bad = await checkDayChange(q, userId, input, today);
      if (bad) throw new Error(bad);
      return addDayChange(q, userId, { ...input, reason: why(c.reason), author: "ai" }, at);
    }
    case "suggest":
      return null;
  }
}

/** Proposals about the same thing replace each other, so only the latest waits for him. */
function proposalKey(c: AiChange): string | null {
  switch (c.type) {
    case "load":
    case "reps":
      return `${c.type}:${c.track}`;
    case "targets":
      return "targets";
    case "move":
    case "skip":
      return `day:${c.date}`;
    case "suggest":
      return null;
  }
}

export interface ActResult {
  noteId: string;
  applied: { index: number; type: AiChange["type"]; ref: string | null }[];
  proposed: { index: number; type: AiChange["type"]; id: string; why: string }[];
  rejected: { index: number; type: AiChange["type"]; error: string }[];
}

export class AiInputError extends Error {}

/** One AI run's reply: store the note and notebook, apply what's within limits, file the rest as proposals. */
export async function actAi(db: Db, userId: string, body: unknown, at: Date): Promise<ActResult> {
  const parsed = ActSchema.safeParse(body);
  if (!parsed.success) throw new AiInputError(parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  const act = parsed.data;
  const today = localDate(at);
  if (act.date !== today) throw new AiInputError(`This reply is for ${act.date}, but today is ${today}. Fetch a fresh context.`);

  const run = await ensureTodayRun(db, userId, at);
  const [settings, targets] = await Promise.all([loadSettings(db, userId), loadTargets(db, userId)]);
  const ctx: ClassifyContext = {
    today,
    states: run.output.states,
    gym: settings.gym,
    kcalWeekAgo: targetOn(targets, addDays(today, -7)).kcal,
  };
  const iso = at.toISOString();
  const result: ActResult = { noteId: "", applied: [], proposed: [], rejected: [] };

  await db.tx(async (q) => {
    const rows = await q.query<{ id: string }>(
      `insert into ai_notes (user_id, date, kind, note, notebook, model, recorded_at)
       values ($1, $2::date, $3, $4, $5, $6, $7::timestamptz) returning id`,
      [userId, today, act.kind, act.note, act.notebook, act.model ?? "", iso],
    );
    result.noteId = rows[0].id;
    for (const [index, c] of act.changes.entries()) {
      const v = classifyChange(c, ctx);
      if (v.kind === "reject") {
        result.rejected.push({ index, type: c.type, error: v.error });
      } else if (v.kind === "review") {
        const key = proposalKey(c);
        if (key) {
          await q.query(
            `update ai_proposals set status = 'replaced', decided_at = $3::timestamptz
             where user_id = $1 and status = 'pending' and change->>'key' = $2`,
            [userId, key, iso],
          );
        }
        const p = await q.query<{ id: string }>(
          `insert into ai_proposals (user_id, date, change, reason, why_review, recorded_at)
           values ($1, $2::date, $3::jsonb, $4, $5, $6::timestamptz) returning id`,
          [userId, today, JSON.stringify({ ...c, key }), "reason" in c ? c.reason : c.text, v.why, iso],
        );
        result.proposed.push({ index, type: c.type, id: p[0].id, why: v.why });
      } else {
        try {
          result.applied.push({ index, type: c.type, ref: await applyChange(q, userId, c, today, iso) });
        } catch (e) {
          result.rejected.push({ index, type: c.type, error: e instanceof Error ? e.message : String(e) });
        }
      }
    }
  });

  if (result.applied.length) await refreshCoach(db, userId, "override", at);
  return result;
}

// ---------------------------------------------------------------------------
// His decision on a proposal
// ---------------------------------------------------------------------------

export async function decideProposal(db: Db, userId: string, id: string, approve: boolean, at: Date): Promise<string | null> {
  const iso = at.toISOString();
  const today = localDate(at);
  const rows = await db.query<{ change: AiChange & { key?: string } }>(
    `select change from ai_proposals where user_id = $1 and id = $2::uuid and status = 'pending'`,
    [userId, id],
  );
  if (!rows.length) return "That proposal is no longer pending.";
  if (!approve) {
    await db.query(`update ai_proposals set status = 'rejected', decided_at = $3::timestamptz where user_id = $1 and id = $2::uuid`, [userId, id, iso]);
    return null;
  }
  const change = ChangeSchema.safeParse(rows[0].change);
  if (!change.success) return "That proposal can't be read.";
  try {
    await db.tx(async (q) => {
      const ref = await applyChange(q, userId, change.data, today, iso, true);
      await q.query(
        `update ai_proposals set status = 'approved', decided_at = $3::timestamptz, applied_ref = $4 where user_id = $1 and id = $2::uuid`,
        [userId, id, iso, ref],
      );
    });
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  await refreshCoach(db, userId, "override", at);
  return null;
}

// ---------------------------------------------------------------------------
// Reading for the Coach page and home
// ---------------------------------------------------------------------------

export interface AiNote {
  id: string;
  date: string;
  kind: "daily" | "weekly";
  note: string;
  notebook: string;
  model: string;
  recordedAt: string;
}

export async function listAiNotes(q: Queryable, userId: string, limit = 20): Promise<AiNote[]> {
  const rows = await q.query<{ id: string; date: string; kind: "daily" | "weekly"; note: string; notebook: string; model: string; recorded_at: string }>(
    `select id, date, kind, note, notebook, model, recorded_at from ai_notes
     where user_id = $1 and superseded_at is null order by recorded_at desc limit $2::int`,
    [userId, limit],
  );
  return rows.map((r) => ({ id: r.id, date: r.date, kind: r.kind, note: r.note, notebook: r.notebook, model: r.model, recordedAt: r.recorded_at }));
}

export interface AiProposal {
  id: string;
  date: string;
  change: AiChange;
  reason: string;
  whyReview: string;
  status: "pending" | "approved" | "rejected" | "replaced";
  decidedAt: string | null;
  recordedAt: string;
}

export async function listProposals(q: Queryable, userId: string, opts: { pending?: boolean; limit?: number } = {}): Promise<AiProposal[]> {
  const rows = await q.query<{
    id: string; date: string; change: AiChange; reason: string; why_review: string; status: AiProposal["status"]; decided_at: string | null; recorded_at: string;
  }>(
    `select id, date, change, reason, why_review, status, decided_at, recorded_at from ai_proposals
     where user_id = $1 ${opts.pending ? "and status = 'pending'" : ""} order by recorded_at desc limit $2::int`,
    [userId, opts.limit ?? 20],
  );
  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    change: r.change,
    reason: r.reason,
    whyReview: r.why_review,
    status: r.status,
    decidedAt: r.decided_at,
    recordedAt: r.recorded_at,
  }));
}

export function describeChange(c: AiChange): string {
  const name = (track: string) => {
    const slot = schemeForTrack(track);
    return slot ? exercise(slot.exercise).name : track;
  };
  switch (c.type) {
    case "load":
      return `${name(c.track)}: ${c.weight} kg`;
    case "reps":
      return `${name(c.track)}: ${c.reps.join(", ")} reps`;
    case "targets":
      return `Targets: ${c.kcal} kcal · ${c.protein} P · ${c.carbs} C · ${c.fat} F`;
    case "move":
      return `Move ${c.date} → ${c.toDate}`;
    case "skip":
      return `Skip ${c.date}`;
    case "suggest":
      return c.text;
  }
}

// ---------------------------------------------------------------------------
// What the AI reads
// ---------------------------------------------------------------------------

export async function aiContext(db: Db, userId: string, at: Date) {
  const today = localDate(at);
  const since = addDays(today, -HISTORY_DAYS);
  const run = await ensureTodayRun(db, userId, at);
  const out = run.output;
  const [settings, goals, weighIns, nutrition, sets, measurements, overrides, targets, dayChanges, notes, proposals] = await Promise.all([
    loadSettings(db, userId),
    listGoals(db, userId),
    loadWeighIns(db, userId),
    loadNutrition(db, userId),
    loadSets(db, userId),
    loadMeasurements(db, userId),
    loadOverrides(db, userId),
    loadTargets(db, userId),
    loadDayChanges(db, userId),
    listAiNotes(db, userId, 12),
    listProposals(db, userId, { limit: 20 }),
  ]);

  const byDate = new Map<string, Map<string, string[]>>();
  for (const s of sets.filter((x) => x.date >= since && !x.isWarmup)) {
    const day = byDate.get(s.date) ?? new Map<string, string[]>();
    const k = `${s.exercise} (${s.track})`;
    day.set(k, [...(day.get(k) ?? []), `${s.weight === null ? "BW" : s.weight}x${s.reps}`]);
    byDate.set(s.date, day);
  }
  const sleepHours = (w: (typeof weighIns)[number]) =>
    w.bedAt && w.wakeAt ? Math.round(((new Date(w.wakeAt).getTime() - new Date(w.bedAt).getTime()) / 3_600_000) * 10) / 10 : null;

  return {
    about: "LockdIn AI coach context. Read `brief` first; reply by POSTing to /api/ai/act.",
    brief: AI_BRIEF,
    limits: AI_LIMITS,
    now: at.toISOString(),
    today,
    weekday: new Date(`${today}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" }),
    suggestedKind: new Date(`${today}T12:00:00Z`).getUTCDay() === 1 ? "weekly" : "daily",
    program: {
      week: out.week,
      phase: out.phaseLabel,
      rulesVersion: out.rulesVersion,
      thisWeek: weekPlan(today, settings.schedule).map(dayView),
      nextWeek: weekPlan(addDays(weekStart(today), 7), settings.schedule).map(dayView),
      sessions: SESSIONS.map((s) => ({
        key: s.key,
        name: s.name,
        weekday: s.weekday,
        slots: s.slots.map((sl) => ({ slot: sl.slot, exercise: sl.exercise, track: sl.track, sets: sl.sets, reps: sl.reps, rir: sl.rir })),
      })),
    },
    gym: settings.gym,
    goals: goals.map((g) => ({ title: g.title, targetDate: g.targetDate, metric: g.metric, start: g.startValue, target: g.targetValue, achieved: !!g.achievedAt })),
    todayRun: {
      card: out.card,
      gate: out.gate,
      morning: out.morning,
      targets: out.targets,
      yesterday: out.yesterday,
      weekly: out.weekly,
      monthly: out.monthly,
      changes: out.changes,
      bestEvents: out.bestEvents,
      missing: out.missing,
      ruleNote: out.note,
    },
    states: out.states,
    history: {
      days: HISTORY_DAYS,
      sessions: [...byDate.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, lifts]) => ({ date, lifts: Object.fromEntries(lifts) })),
      weighIns: weighIns.filter((w) => w.date >= since).map((w) => ({ date: w.date, kg: w.weight, protocolOk: w.protocolOk, sleepH: sleepHours(w) })),
      nutrition: nutrition.filter((n) => n.date >= since).map((n) => ({ date: n.date, kcal: n.kcal, p: n.protein, c: n.carbs, f: n.fat })),
      measurements: measurements.map((m) => ({ date: m.date, kind: m.kind, cm: m.valueCm })),
      targets: targets.map((t) => ({ from: t.effectiveDate, kcal: t.kcal, p: t.protein, c: t.carbs, f: t.fat, source: t.source, reason: t.reason })),
      overrides: overrides.filter((o) => o.date >= since).map((o) => ({ date: o.date, target: o.target, field: o.field, value: o.value, reason: o.reason, by: o.author ?? "user" })),
      dayChanges: dayChanges.filter((c) => c.date >= since).map((c) => ({ ...c, by: c.author })),
    },
    notebook: notes.map((n) => ({ date: n.date, kind: n.kind, notebook: n.notebook, note: n.note })),
    proposals: proposals.map((p) => ({ date: p.date, change: p.change, whyReview: p.whyReview, status: p.status, decidedAt: p.decidedAt })),
  };
}

function dayView(p: ReturnType<typeof weekPlan>[number]) {
  return p.kind === "train"
    ? { date: p.date, session: p.session.key, name: p.session.name, movedFrom: p.movedFrom ?? null }
    : { date: p.date, rest: p.reason, movedTo: p.movedTo ?? null };
}
