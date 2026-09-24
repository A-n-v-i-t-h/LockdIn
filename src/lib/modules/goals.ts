import type { Queryable } from "@/lib/db";
import { plural } from "@/lib/format";
import { isIsoDate } from "@/lib/time";

export type GoalMetric = "bench_e1rm" | "bodyweight_avg";

export interface Milestone {
  id: string;
  title: string;
  sort: number;
  doneAt: string | null;
}

export interface Goal {
  id: string;
  title: string;
  category: string;
  targetDate: string | null;
  kind: "manual" | "auto";
  metric: GoalMetric | null;
  startValue: number | null;
  targetValue: number | null;
  notes: string;
  createdAt: string;
  achievedAt: string | null;
  archivedAt: string | null;
  milestones: Milestone[];
}

export const CATEGORIES = ["Strength", "Body", "Build", "Mind", "Money", "General"];

export interface GoalMetrics {
  benchE1rm: number | null;
  bodyweightAvg: number | null;
}

export interface GoalProgress {
  pct: number;
  current: number | null;
  label: string;
}

const clampPct = (x: number) => Math.max(0, Math.min(100, Math.round(x)));

export function goalProgress(g: Goal, m: GoalMetrics): GoalProgress {
  if (g.kind === "auto" && g.metric && g.targetValue !== null) {
    const current = g.metric === "bench_e1rm" ? m.benchE1rm : m.bodyweightAvg;
    if (current === null) return { pct: 0, current: null, label: g.metric === "bench_e1rm" ? "No bench sets in the 6–12 range yet" : "No weigh-ins yet" };
    const start = g.startValue ?? 0;
    const span = g.targetValue - start;
    const pct = span <= 0 ? (current >= g.targetValue ? 100 : 0) : ((current - start) / span) * 100;
    const label =
      g.metric === "bench_e1rm"
        ? `Estimated max ${current.toFixed(1)} of ${g.targetValue} kg`
        : `Average ${current.toFixed(2)} kg, started at ${start}`;
    return { pct: clampPct(pct), current, label };
  }
  const total = g.milestones.length;
  if (total === 0) return { pct: g.achievedAt ? 100 : 0, current: null, label: g.achievedAt ? "Done" : "No milestones yet" };
  const done = g.milestones.filter((x) => x.doneAt).length;
  return { pct: clampPct((done / total) * 100), current: done, label: `${done} of ${plural(total, "milestone")}` };
}

export function nextMilestone(g: Goal): Milestone | null {
  return [...g.milestones].sort((a, b) => a.sort - b.sort).find((x) => !x.doneAt) ?? null;
}

interface Row {
  id: string; title: string; category: string; target_date: string | null; kind: "manual" | "auto";
  metric: GoalMetric | null; start_value: number | null; target_value: number | null; notes: string;
  created_at: string; achieved_at: string | null; archived_at: string | null;
}

export async function listGoals(q: Queryable, userId: string, includeArchived = false): Promise<Goal[]> {
  const [rows, ms] = await Promise.all([
    q.query<Row>(
      `select id, title, category, target_date, kind, metric, start_value, target_value, notes, created_at, achieved_at, archived_at
       from goals where user_id = $1 and ($2::boolean or archived_at is null)
       order by archived_at nulls first, target_date nulls last, sort, created_at`,
      [userId, includeArchived],
    ),
    q.query<{ id: string; goal_id: string; title: string; sort: number; done_at: string | null }>(
      `select id, goal_id, title, sort, done_at from goal_milestones where user_id = $1 order by sort, created_at`,
      [userId],
    ),
  ]);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    category: r.category,
    targetDate: r.target_date,
    kind: r.kind,
    metric: r.metric,
    startValue: r.start_value,
    targetValue: r.target_value,
    notes: r.notes,
    createdAt: r.created_at,
    achievedAt: r.achieved_at,
    archivedAt: r.archived_at,
    milestones: ms.filter((m) => m.goal_id === r.id).map((m) => ({ id: m.id, title: m.title, sort: m.sort, doneAt: m.done_at })),
  }));
}

export interface GoalInput {
  title: string;
  category: string;
  targetDate: string | null;
  kind: "manual" | "auto";
  metric: GoalMetric | null;
  startValue: number | null;
  targetValue: number | null;
  notes: string;
  milestones: string[];
}

export function validateGoal(input: GoalInput): string | null {
  if (!input.title.trim()) return "Give the goal a title.";
  if (input.title.length > 200) return "Keep the title under 200 characters.";
  if (input.targetDate && !isIsoDate(input.targetDate)) return "That date isn't valid.";
  if (input.kind === "auto") {
    if (input.metric !== "bench_e1rm" && input.metric !== "bodyweight_avg") return "Pick what the goal tracks.";
    if (input.targetValue === null || !Number.isFinite(input.targetValue) || input.targetValue <= 0) return "Set a target number.";
  }
  if (input.milestones.some((m) => m.length > 200)) return "Keep milestones under 200 characters.";
  return null;
}

export async function createGoal(q: Queryable, userId: string, input: GoalInput, at: string): Promise<string> {
  const problem = validateGoal(input);
  if (problem) throw new Error(problem);
  const rows = await q.query<{ id: string }>(
    `insert into goals (user_id, title, category, target_date, kind, metric, start_value, target_value, notes, created_at)
     values ($1, $2, $3, $4::date, $5, $6, $7::numeric, $8::numeric, $9, $10::timestamptz) returning id`,
    [
      userId, input.title.trim(), input.category || "General", input.targetDate, input.kind,
      input.kind === "auto" ? input.metric : null, input.kind === "auto" ? input.startValue : null,
      input.kind === "auto" ? input.targetValue : null, input.notes.slice(0, 2000), at,
    ],
  );
  const id = rows[0].id;
  let sort = 0;
  for (const m of input.milestones.map((x) => x.trim()).filter(Boolean)) {
    await addMilestone(q, userId, id, m, at, sort++);
  }
  return id;
}

export async function updateGoal(q: Queryable, userId: string, id: string, input: Omit<GoalInput, "milestones" | "kind" | "metric" | "startValue">): Promise<void> {
  if (!input.title.trim()) throw new Error("Give the goal a title.");
  if (input.targetDate && !isIsoDate(input.targetDate)) throw new Error("That date isn't valid.");
  await q.query(
    `update goals set title = $3, category = $4, target_date = $5::date, notes = $6,
       target_value = case when kind = 'auto' then coalesce($7::numeric, target_value) else target_value end
     where user_id = $1 and id = $2::uuid`,
    [userId, id, input.title.trim(), input.category || "General", input.targetDate, input.notes.slice(0, 2000), input.targetValue],
  );
}

export async function addMilestone(q: Queryable, userId: string, goalId: string, title: string, at: string, sort?: number): Promise<string> {
  const owned = await q.query<{ id: string }>(`select id from goals where user_id = $1 and id = $2::uuid`, [userId, goalId]);
  if (!owned.length) throw new Error("Goal not found.");
  const clean = title.trim();
  if (!clean) throw new Error("A milestone needs a title.");
  let s = sort;
  if (s === undefined) {
    const [{ next }] = await q.query<{ next: number }>(`select coalesce(max(sort), -1) + 1 as next from goal_milestones where goal_id = $1::uuid`, [goalId]);
    s = next;
  }
  const rows = await q.query<{ id: string }>(
    `insert into goal_milestones (user_id, goal_id, title, sort, created_at) values ($1, $2::uuid, $3, $4, $5::timestamptz) returning id`,
    [userId, goalId, clean.slice(0, 200), s, at],
  );
  return rows[0].id;
}

export async function setMilestoneDone(q: Queryable, userId: string, id: string, done: boolean, at: string): Promise<void> {
  await q.query(`update goal_milestones set done_at = $3::timestamptz where user_id = $1 and id = $2::uuid`, [userId, id, done ? at : null]);
}

export async function deleteMilestone(q: Queryable, userId: string, id: string): Promise<void> {
  await q.query(`delete from goal_milestones where user_id = $1 and id = $2::uuid`, [userId, id]);
}

export async function setGoalArchived(q: Queryable, userId: string, id: string, archived: boolean, at: string): Promise<void> {
  await q.query(`update goals set archived_at = $3::timestamptz where user_id = $1 and id = $2::uuid`, [userId, id, archived ? at : null]);
}

export async function setGoalAchieved(q: Queryable, userId: string, id: string, achieved: boolean, at: string): Promise<void> {
  await q.query(`update goals set achieved_at = $3::timestamptz where user_id = $1 and id = $2::uuid`, [userId, id, achieved ? at : null]);
}

/** The two goals the plan already names. Added once, when the account is created. */
export async function seedPlanGoals(q: Queryable, userId: string, at: string): Promise<void> {
  const existing = await q.query<{ n: number }>(`select count(*)::int as n from goals where user_id = $1`, [userId]);
  if (existing[0].n > 0) return;
  await createGoal(q, userId, {
    title: "Bench 100 kg",
    category: "Strength",
    targetDate: "2029-12-31",
    kind: "auto",
    metric: "bench_e1rm",
    startValue: 0,
    targetValue: 100,
    notes: "Honest timeline from the plan: 2028–29, at about 75–78 kg bodyweight.",
    milestones: [],
  }, at);
  await createGoal(q, userId, {
    title: "Reach 65 kg bodyweight",
    category: "Body",
    targetDate: "2027-03-31",
    kind: "auto",
    metric: "bodyweight_avg",
    startValue: 57.7,
    targetValue: 65,
    notes: "Phase 1 regain. At 65 kg the rate drops to Phase 2 and calories get recalculated.",
    milestones: [],
  }, at);
}
