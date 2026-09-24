// Data access for the fitness log. Every writer here is append-only: an edit
// stamps the current row `superseded_at` and inserts its replacement with the
// same instant as `recorded_at`, so "as of T" reads are exact.
import type { Queryable } from "@/lib/db";
import { isIsoDate } from "@/lib/time";
import { DEFAULT_GYM, sanitiseGym, type GymSettings } from "./equipment";
import type { MorningOutput } from "./engine";
import { EXERCISES, isKnownExercise, schemeForTrack } from "./program";
import type { LoggedSet, OverrideEvent, TrackState } from "./progression";
import type { Measurement, NutritionDay, Targets, WeighIn } from "./nutrition";
import { DEFAULT_SCHEDULE, type DayChange, type ScheduleSettings } from "./schedule";

const asOfClause = (alias = "") =>
  `${alias}recorded_at <= $2::timestamptz and (${alias}superseded_at is null or ${alias}superseded_at > $2::timestamptz)`;

const FAR_FUTURE = "9999-12-31T00:00:00.000Z";

/** Who made a change: him, or the AI coach. */
export type Author = "user" | "ai";

// ---------------------------------------------------------------------------
// Readers
// ---------------------------------------------------------------------------

export async function loadWeighIns(q: Queryable, userId: string, asOf = FAR_FUTURE): Promise<WeighIn[]> {
  const rows = await q.query<{
    id: string; date: string; weight_kg: number | null; protocol_ok: boolean;
    bed_at: string | null; wake_at: string | null; recorded_at: string;
  }>(
    `select id, date, weight_kg, protocol_ok, bed_at, wake_at, recorded_at
     from weigh_ins where user_id = $1 and ${asOfClause()} order by date`,
    [userId, asOf],
  );
  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    weight: r.weight_kg,
    protocolOk: r.protocol_ok,
    bedAt: r.bed_at,
    wakeAt: r.wake_at,
    recordedAt: r.recorded_at,
  }));
}

export async function loadNutrition(q: Queryable, userId: string, asOf = FAR_FUTURE): Promise<NutritionDay[]> {
  const rows = await q.query<{
    id: string; date: string; kcal: number; protein_g: number; carbs_g: number; fat_g: number; note: string; recorded_at: string;
  }>(
    `select id, date, kcal, protein_g, carbs_g, fat_g, note, recorded_at
     from nutrition_days where user_id = $1 and ${asOfClause()} order by date`,
    [userId, asOf],
  );
  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    kcal: r.kcal,
    protein: r.protein_g,
    carbs: r.carbs_g,
    fat: r.fat_g,
    note: r.note,
    recordedAt: r.recorded_at,
  }));
}

export async function loadMeasurements(q: Queryable, userId: string, asOf = FAR_FUTURE): Promise<Measurement[]> {
  const rows = await q.query<{ id: string; date: string; kind: string; value_cm: number; recorded_at: string }>(
    `select id, date, kind, value_cm, recorded_at
     from measurements where user_id = $1 and ${asOfClause()} order by date, kind`,
    [userId, asOf],
  );
  return rows.map((r) => ({ id: r.id, date: r.date, kind: r.kind, valueCm: r.value_cm, recordedAt: r.recorded_at }));
}

interface SetRow {
  id: string; session_id: string; date: string; slot: string; exercise_key: string; track_key: string;
  substitute_for: string | null; set_index: number; weight_kg: number | null; reps: number; is_warmup: boolean;
  planned_weight_kg: number | null; planned_reps: number | null; recorded_at: string;
}

const toSet = (r: SetRow): LoggedSet => ({
  id: r.id,
  date: r.date,
  sessionId: r.session_id,
  slot: r.slot,
  exercise: r.exercise_key,
  track: r.track_key,
  setIndex: r.set_index,
  weight: r.weight_kg,
  reps: r.reps,
  isWarmup: r.is_warmup,
  recordedAt: r.recorded_at,
});

export async function loadSets(q: Queryable, userId: string, asOf = FAR_FUTURE): Promise<LoggedSet[]> {
  const rows = await q.query<SetRow>(
    `select s.id, s.session_id, s.date, s.slot, s.exercise_key, s.track_key, s.substitute_for, s.set_index,
            s.weight_kg, s.reps, s.is_warmup, s.planned_weight_kg, s.planned_reps, s.recorded_at
     from set_logs s join sessions x on x.id = s.session_id
     where s.user_id = $1 and ${asOfClause("s.")} and (x.deleted_at is null or x.deleted_at > $2::timestamptz)
     order by s.date, s.slot, s.set_index`,
    [userId, asOf],
  );
  return rows.map(toSet);
}

export async function loadOverrides(q: Queryable, userId: string, asOf = FAR_FUTURE): Promise<OverrideEvent[]> {
  const rows = await q.query<{
    id: string; date: string; target: string; field: "weight" | "reps" | "targets"; value: unknown; reason: string; recorded_at: string; author: Author;
  }>(
    `select id, date, target, field, value, reason, recorded_at, author
     from overrides where user_id = $1 and ${asOfClause()} order by recorded_at`,
    [userId, asOf],
  );
  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    target: r.target,
    field: r.field,
    value: r.value,
    reason: r.reason,
    recordedAt: r.recorded_at,
    author: r.author,
  }));
}

export async function loadTargets(q: Queryable, userId: string, asOf = FAR_FUTURE): Promise<Targets[]> {
  const rows = await q.query<{
    id: string; effective_date: string; kcal: number; protein_g: number; carbs_g: number; fat_g: number;
    source: Targets["source"]; reason: string; recorded_at: string;
  }>(
    `select id, effective_date, kcal, protein_g, carbs_g, fat_g, source, reason, recorded_at
     from nutrition_targets where user_id = $1 and ${asOfClause()} order by effective_date, recorded_at`,
    [userId, asOf],
  );
  return rows.map((r) => ({
    id: r.id,
    effectiveDate: r.effective_date,
    kcal: r.kcal,
    protein: r.protein_g,
    carbs: r.carbs_g,
    fat: r.fat_g,
    source: r.source,
    reason: r.reason,
    recordedAt: r.recorded_at,
  }));
}

export interface FitnessSettings {
  gym: GymSettings;
  schedule: ScheduleSettings;
}

export async function loadSettings(q: Queryable, userId: string, asOf = FAR_FUTURE): Promise<FitnessSettings> {
  const [rows, changes] = await Promise.all([
    q.query<{ key: string; value: unknown }>(`select key, value from settings where user_id = $1 and ${asOfClause()}`, [userId, asOf]),
    loadDayChanges(q, userId, asOf),
  ]);
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const sched = map.get("schedule") as Partial<ScheduleSettings> | undefined;
  const restDay = Number(sched?.buildRestDay);
  return {
    gym: map.has("gym") ? sanitiseGym(map.get("gym") as Partial<GymSettings>) : DEFAULT_GYM,
    schedule: {
      buildRestDay: Number.isInteger(restDay) && restDay >= 1 && restDay <= 6 ? restDay : DEFAULT_SCHEDULE.buildRestDay,
      ...(changes.length ? { changes } : {}),
    },
  };
}

export async function loadDayChanges(q: Queryable, userId: string, asOf = FAR_FUTURE): Promise<(DayChange & { reason: string; author: Author })[]> {
  const rows = await q.query<{ id: string; kind: "move" | "skip"; date: string; to_date: string | null; reason: string; recorded_at: string; author: Author }>(
    `select id, kind, date, to_date, reason, recorded_at, author from day_changes
     where user_id = $1 and ${asOfClause()} order by recorded_at, id`,
    [userId, asOf],
  );
  return rows.map((r) =>
    r.kind === "move"
      ? { id: r.id, kind: "move", date: r.date, toDate: r.to_date!, reason: r.reason, recordedAt: r.recorded_at, author: r.author }
      : { id: r.id, kind: "skip", date: r.date, reason: r.reason, recordedAt: r.recorded_at, author: r.author },
  );
}

export async function addDayChange(
  q: Queryable,
  userId: string,
  input: { kind: "move" | "skip"; date: string; toDate?: string | null; reason?: string; author?: Author },
  at: string,
): Promise<string> {
  assertDate(input.date);
  if (input.kind === "move") assertDate(input.toDate ?? "");
  const rows = await q.query<{ id: string }>(
    `insert into day_changes (user_id, kind, date, to_date, reason, recorded_at, author)
     values ($1, $2, $3::date, $4::date, $5, $6::timestamptz, $7) returning id`,
    [userId, input.kind, input.date, input.kind === "move" ? input.toDate : null, (input.reason ?? "").slice(0, 200), at, input.author ?? "user"],
  );
  return rows[0].id;
}

/** Undo: the change stays in history, stamped with when it stopped applying. */
export async function revokeDayChange(q: Queryable, userId: string, id: string, at: string): Promise<boolean> {
  const rows = await q.query<{ id: string }>(
    `update day_changes set superseded_at = $3::timestamptz where user_id = $1 and id = $2::uuid and superseded_at is null returning id`,
    [userId, id, at],
  );
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Writers
// ---------------------------------------------------------------------------

function assertDate(date: string) {
  if (!isIsoDate(date)) throw new Error(`Invalid date: ${date}`);
}

async function supersede(q: Queryable, table: string, where: string, params: unknown[], at: string): Promise<string | null> {
  const rows = await q.query<{ id: string }>(
    `update ${table} set superseded_at = $${params.length + 1}::timestamptz
     where ${where} and superseded_at is null returning id`,
    [...params, at],
  );
  return rows[0]?.id ?? null;
}

export async function saveWeighIn(
  q: Queryable,
  userId: string,
  input: { date: string; weight: number | null; protocolOk: boolean; bedAt: string | null; wakeAt: string | null; note?: string },
  at: string,
): Promise<string> {
  assertDate(input.date);
  const prev = await supersede(q, "weigh_ins", "user_id = $1 and date = $2::date", [userId, input.date], at);
  const rows = await q.query<{ id: string }>(
    `insert into weigh_ins (user_id, date, weight_kg, protocol_ok, bed_at, wake_at, note, recorded_at, supersedes)
     values ($1, $2::date, $3::numeric, $4, $5::timestamptz, $6::timestamptz, $7, $8::timestamptz, $9::uuid) returning id`,
    [userId, input.date, input.weight, input.protocolOk, input.bedAt, input.wakeAt, input.note ?? "", at, prev],
  );
  return rows[0].id;
}

export async function saveNutrition(
  q: Queryable,
  userId: string,
  input: { date: string; kcal: number; protein: number; carbs: number; fat: number; note?: string },
  at: string,
): Promise<string> {
  assertDate(input.date);
  const prev = await supersede(q, "nutrition_days", "user_id = $1 and date = $2::date", [userId, input.date], at);
  const rows = await q.query<{ id: string }>(
    `insert into nutrition_days (user_id, date, kcal, protein_g, carbs_g, fat_g, note, recorded_at, supersedes)
     values ($1, $2::date, $3::int, $4::numeric, $5::numeric, $6::numeric, $7, $8::timestamptz, $9::uuid) returning id`,
    [userId, input.date, input.kcal, input.protein, input.carbs, input.fat, input.note ?? "", at, prev],
  );
  return rows[0].id;
}

export const MEASUREMENT_KINDS = ["waist", "arm_r", "arm_l", "chest", "thigh", "hips", "bideltoid", "neck", "forearm_r", "forearm_l", "waist_front"] as const;
export type MeasurementKind = (typeof MEASUREMENT_KINDS)[number];

export async function saveMeasurement(
  q: Queryable,
  userId: string,
  input: { date: string; kind: MeasurementKind; valueCm: number | null; note?: string },
  at: string,
): Promise<string | null> {
  assertDate(input.date);
  if (!MEASUREMENT_KINDS.includes(input.kind)) throw new Error(`Unknown measurement: ${input.kind}`);
  const prev = await supersede(
    q,
    "measurements",
    "user_id = $1 and date = $2::date and kind = $3",
    [userId, input.date, input.kind],
    at,
  );
  if (input.valueCm === null) return null; // cleared: the superseded row stays as history
  const rows = await q.query<{ id: string }>(
    `insert into measurements (user_id, date, kind, value_cm, note, recorded_at, supersedes)
     values ($1, $2::date, $3, $4::numeric, $5, $6::timestamptz, $7::uuid) returning id`,
    [userId, input.date, input.kind, input.valueCm, input.note ?? "", at, prev],
  );
  return rows[0].id;
}

export interface SessionRow {
  id: string;
  date: string;
  sessionKey: string;
  runId: string | null;
  startedAt: string;
  finishedAt: string | null;
  note: string;
}

const toSession = (r: {
  id: string; date: string; session_key: string; run_id: string | null; started_at: string; finished_at: string | null; note: string;
}): SessionRow => ({
  id: r.id,
  date: r.date,
  sessionKey: r.session_key,
  runId: r.run_id,
  startedAt: r.started_at,
  finishedAt: r.finished_at,
  note: r.note,
});

export async function getSession(q: Queryable, userId: string, date: string): Promise<SessionRow | null> {
  const rows = await q.query<Parameters<typeof toSession>[0]>(
    `select id, date, session_key, run_id, started_at, finished_at, note
     from sessions where user_id = $1 and date = $2::date and deleted_at is null`,
    [userId, date],
  );
  return rows[0] ? toSession(rows[0]) : null;
}

export async function getSessionById(q: Queryable, userId: string, id: string): Promise<SessionRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const rows = await q.query<Parameters<typeof toSession>[0]>(
    `select id, date, session_key, run_id, started_at, finished_at, note
     from sessions where user_id = $1 and id = $2 and deleted_at is null`,
    [userId, id],
  );
  return rows[0] ? toSession(rows[0]) : null;
}

export async function startSession(
  q: Queryable,
  userId: string,
  input: { date: string; sessionKey: string; runId: string | null },
  at: string,
): Promise<SessionRow> {
  assertDate(input.date);
  const existing = await getSession(q, userId, input.date);
  if (existing) return existing;
  // The run id comes from the browser: link it only if the run is this account's.
  const rows = await q.query<Parameters<typeof toSession>[0]>(
    `insert into sessions (user_id, date, session_key, run_id, started_at)
     values ($1::uuid, $2::date, $3, (select id from coach_runs where id = $4::uuid and user_id = $1::uuid), $5::timestamptz)
     returning id, date, session_key, run_id, started_at, finished_at, note`,
    [userId, input.date, input.sessionKey, input.runId, at],
  );
  return toSession(rows[0]);
}

export async function finishSession(q: Queryable, userId: string, sessionId: string, note: string, at: string): Promise<void> {
  await q.query(
    `update sessions set finished_at = coalesce(finished_at, $3::timestamptz), note = $4
     where user_id = $1 and id = $2 and deleted_at is null`,
    [userId, sessionId, at, note.slice(0, 2000)],
  );
}

export async function reopenSession(q: Queryable, userId: string, sessionId: string): Promise<void> {
  await q.query(`update sessions set finished_at = null where user_id = $1 and id = $2`, [userId, sessionId]);
}

export interface SetInput {
  slot: string;
  exercise: string;
  track: string;
  substituteFor: string | null;
  setIndex: number;
  weight: number | null;
  reps: number;
  isWarmup?: boolean;
  plannedWeight?: number | null;
  plannedReps?: number | null;
}

export function validateSetInput(s: SetInput): string | null {
  if (!/^[0-9a-z]{1,4}$/.test(s.slot)) return "Bad slot.";
  if (!isKnownExercise(s.exercise)) return "Unknown exercise.";
  if (!schemeForTrack(s.track)) return "Unknown track.";
  if (!Number.isInteger(s.setIndex) || s.setIndex < 1 || s.setIndex > 20) return "Set number out of range.";
  if (!Number.isInteger(s.reps) || s.reps < 0 || s.reps > 100) return "Reps must be 0–100.";
  if (s.weight !== null && (!Number.isFinite(s.weight) || s.weight < 0 || s.weight > 500)) return "Weight must be 0–500 kg.";
  if (EXERCISES[s.exercise].equipment !== "none" && s.weight === null) return "Enter a weight.";
  return null;
}

export async function logSet(q: Queryable, userId: string, session: SessionRow, input: SetInput, at: string): Promise<string> {
  const problem = validateSetInput(input);
  if (problem) throw new Error(problem);
  const weight = EXERCISES[input.exercise].equipment === "none" ? null : input.weight;
  const prev = await supersede(
    q,
    "set_logs",
    "user_id = $1 and session_id = $2::uuid and slot = $3 and set_index = $4::int",
    [userId, session.id, input.slot, input.setIndex],
    at,
  );
  const rows = await q.query<{ id: string }>(
    `insert into set_logs (user_id, session_id, date, slot, exercise_key, track_key, substitute_for, set_index,
                           weight_kg, reps, is_warmup, planned_weight_kg, planned_reps, recorded_at, supersedes)
     values ($1, $2::uuid, $3::date, $4, $5, $6, $7, $8::int, $9::numeric, $10::int, $11, $12::numeric, $13::int, $14::timestamptz, $15::uuid)
     returning id`,
    [
      userId, session.id, session.date, input.slot, input.exercise, input.track, input.substituteFor, input.setIndex,
      weight, input.reps, input.isWarmup ?? false, input.plannedWeight ?? null, input.plannedReps ?? null, at, prev,
    ],
  );
  return rows[0].id;
}

export async function removeSet(q: Queryable, userId: string, sessionId: string, slot: string, setIndex: number, at: string): Promise<boolean> {
  const id = await supersede(
    q,
    "set_logs",
    "user_id = $1 and session_id = $2::uuid and slot = $3 and set_index = $4::int",
    [userId, sessionId, slot, setIndex],
    at,
  );
  return id !== null;
}

export async function sessionSets(q: Queryable, userId: string, sessionId: string): Promise<(LoggedSet & { substituteFor: string | null; plannedWeight: number | null; plannedReps: number | null })[]> {
  const rows = await q.query<SetRow>(
    `select id, session_id, date, slot, exercise_key, track_key, substitute_for, set_index, weight_kg, reps,
            is_warmup, planned_weight_kg, planned_reps, recorded_at
     from set_logs where user_id = $1 and session_id = $2::uuid and superseded_at is null
     order by slot, set_index`,
    [userId, sessionId],
  );
  return rows.map((r) => ({ ...toSet(r), substituteFor: r.substitute_for, plannedWeight: r.planned_weight_kg, plannedReps: r.planned_reps }));
}

export async function addOverride(
  q: Queryable,
  userId: string,
  input: { date: string; target: string; field: "weight" | "reps" | "targets"; value: unknown; reason: string; changeRef?: string | null; author?: Author },
  at: string,
): Promise<string> {
  assertDate(input.date);
  const rows = await q.query<{ id: string }>(
    `insert into overrides (user_id, date, target, field, value, reason, change_ref, recorded_at, author)
     values ($1, $2::date, $3, $4, $5::jsonb, $6, $7, $8::timestamptz, $9) returning id`,
    [userId, input.date, input.target, input.field, JSON.stringify(input.value), input.reason.slice(0, 300), input.changeRef ?? null, at, input.author ?? "user"],
  );
  return rows[0].id;
}

export async function revokeOverride(q: Queryable, userId: string, id: string, at: string): Promise<void> {
  await q.query(
    `update overrides set superseded_at = $3::timestamptz where user_id = $1 and id = $2::uuid and superseded_at is null`,
    [userId, id, at],
  );
}

export async function insertTargets(
  q: Queryable,
  userId: string,
  input: { effectiveDate: string; kcal: number; protein: number; carbs: number; fat: number; source: Targets["source"]; reason: string; runId?: string | null; author?: Author },
  at: string,
): Promise<string> {
  assertDate(input.effectiveDate);
  const rows = await q.query<{ id: string }>(
    `insert into nutrition_targets (user_id, effective_date, kcal, protein_g, carbs_g, fat_g, source, reason, run_id, recorded_at, author)
     values ($1, $2::date, $3::int, $4::numeric, $5::numeric, $6::numeric, $7, $8, $9::uuid, $10::timestamptz, $11) returning id`,
    [userId, input.effectiveDate, Math.round(input.kcal), input.protein, input.carbs, input.fat, input.source, input.reason.slice(0, 500), input.runId ?? null, at, input.author ?? "user"],
  );
  return rows[0].id;
}

export async function supersedeCoachTargets(q: Queryable, userId: string, date: string, at: string): Promise<void> {
  await q.query(
    `update nutrition_targets set superseded_at = $3::timestamptz
     where user_id = $1 and effective_date = $2::date and source = 'coach' and superseded_at is null`,
    [userId, date, at],
  );
}

export async function saveSetting(q: Queryable, userId: string, key: "gym" | "schedule", value: unknown, at: string): Promise<void> {
  await supersede(q, "settings", "user_id = $1 and key = $2", [userId, key], at);
  await q.query(
    `insert into settings (user_id, key, value, recorded_at) values ($1, $2, $3::jsonb, $4::timestamptz)`,
    [userId, key, JSON.stringify(value), at],
  );
}

// ---------------------------------------------------------------------------
// Coach runs
// ---------------------------------------------------------------------------

export interface CoachRun {
  id: string;
  runDate: string;
  revision: number;
  trigger: string;
  asOf: string;
  rulesVersion: string;
  inputsDigest: string;
  output: MorningOutput;
  createdAt: string;
  supersededAt: string | null;
}

interface RunRow {
  id: string; run_date: string; revision: number; trigger: string; as_of: string; rules_version: string;
  inputs_digest: string; output: MorningOutput; created_at: string; superseded_at: string | null;
}

const toRun = (r: RunRow): CoachRun => ({
  id: r.id,
  runDate: r.run_date,
  revision: r.revision,
  trigger: r.trigger,
  asOf: r.as_of,
  rulesVersion: r.rules_version,
  inputsDigest: r.inputs_digest,
  output: r.output,
  createdAt: r.created_at,
  supersededAt: r.superseded_at,
});

const RUN_COLS = "id, run_date, revision, trigger, as_of, rules_version, inputs_digest, output, created_at, superseded_at";

export async function getCurrentRun(q: Queryable, userId: string, date: string): Promise<CoachRun | null> {
  const rows = await q.query<RunRow>(
    `select ${RUN_COLS} from coach_runs where user_id = $1 and run_date = $2::date and superseded_at is null`,
    [userId, date],
  );
  return rows[0] ? toRun(rows[0]) : null;
}

export async function getLatestRun(q: Queryable, userId: string, onOrBefore: string): Promise<CoachRun | null> {
  const rows = await q.query<RunRow>(
    `select ${RUN_COLS} from coach_runs where user_id = $1 and run_date <= $2::date and superseded_at is null
     order by run_date desc limit 1`,
    [userId, onOrBefore],
  );
  return rows[0] ? toRun(rows[0]) : null;
}

/** The as-of of the latest run on an earlier day: the cutoff for "new since last time". */
export async function previousRunAsOf(q: Queryable, userId: string, date: string): Promise<string | null> {
  const rows = await q.query<{ as_of: string }>(
    `select as_of from coach_runs where user_id = $1 and run_date < $2::date and superseded_at is null
     order by run_date desc limit 1`,
    [userId, date],
  );
  return rows[0]?.as_of ?? null;
}

export async function listRuns(q: Queryable, userId: string, opts: { from?: string; to?: string; limit?: number } = {}): Promise<CoachRun[]> {
  const rows = await q.query<RunRow>(
    `select ${RUN_COLS} from coach_runs
     where user_id = $1 and superseded_at is null
       and ($2::date is null or run_date >= $2::date) and ($3::date is null or run_date <= $3::date)
     order by run_date desc limit $4::int`,
    [userId, opts.from ?? null, opts.to ?? null, opts.limit ?? 1000],
  );
  return rows.map(toRun);
}

export async function insertRun(
  q: Queryable,
  userId: string,
  input: { date: string; trigger: string; asOf: string; rulesVersion: string; digest: string; output: MorningOutput },
): Promise<CoachRun> {
  const [{ next }] = await q.query<{ next: number }>(
    `select coalesce(max(revision), 0) + 1 as next from coach_runs where user_id = $1 and run_date = $2::date`,
    [userId, input.date],
  );
  await q.query(
    `update coach_runs set superseded_at = $3::timestamptz where user_id = $1 and run_date = $2::date and superseded_at is null`,
    [userId, input.date, input.asOf],
  );
  const rows = await q.query<RunRow>(
    `insert into coach_runs (user_id, run_date, revision, trigger, as_of, rules_version, inputs_digest, output, state, created_at)
     values ($1, $2::date, $3::int, $4, $5::timestamptz, $6, $7, $8::jsonb, $9::jsonb, $5::timestamptz)
     returning ${RUN_COLS}`,
    [
      userId, input.date, next, input.trigger, input.asOf, input.rulesVersion, input.digest,
      JSON.stringify(input.output), JSON.stringify(input.output.states),
    ],
  );
  return toRun(rows[0]);
}

export async function replaceLiftState(q: Queryable, userId: string, states: Record<string, TrackState>, runId: string, at: string): Promise<void> {
  await q.query("delete from lift_state where user_id = $1", [userId]);
  const list = Object.values(states);
  if (!list.length) return;
  // One statement for every track: each insert is a round trip to the database.
  await q.query(
    `insert into lift_state (user_id, track_key, state, run_id, updated_at)
     select $1::uuid, st->>'track', st, $3::uuid, $4::timestamptz from jsonb_array_elements($2::jsonb) as st`,
    [userId, JSON.stringify(list), runId, at],
  );
}

export async function loadLiftState(q: Queryable, userId: string): Promise<Record<string, TrackState>> {
  const rows = await q.query<{ track_key: string; state: TrackState }>(
    "select track_key, state from lift_state where user_id = $1",
    [userId],
  );
  return Object.fromEntries(rows.map((r) => [r.track_key, r.state]));
}

export async function saveReview(
  q: Queryable,
  userId: string,
  input: { kind: "weekly" | "monthly" | "replay"; date: string; runId: string | null; result: unknown },
  at: string,
): Promise<void> {
  await q.query(`delete from reviews where user_id = $1 and kind = $2 and period_date = $3::date`, [userId, input.kind, input.date]);
  await q.query(
    `insert into reviews (user_id, kind, period_date, run_id, result, created_at)
     values ($1, $2, $3::date, $4::uuid, $5::jsonb, $6::timestamptz)`,
    [userId, input.kind, input.date, input.runId, JSON.stringify(input.result), at],
  );
}

export async function listReviews<T = unknown>(q: Queryable, userId: string, kind: "weekly" | "monthly" | "replay", limit = 12) {
  return q.query<{ id: string; period_date: string; result: T; created_at: string }>(
    `select id, period_date, result, created_at from reviews where user_id = $1 and kind = $2
     order by period_date desc, created_at desc limit $3::int`,
    [userId, kind, limit],
  );
}
