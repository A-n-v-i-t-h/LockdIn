import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openDb, type Db } from "@/lib/db";
import { createUser, type User } from "@/lib/auth/users";
import { simulateSeason, type SimSummary } from "@/lib/demo/simulate";
import { getCurrentRun, listReviews, listRuns, loadLiftState, loadTargets } from "@/lib/fitness/repo";
import { replayHistory, type ReplayResult } from "@/lib/fitness/agent";
import { seedPlanGoals } from "@/lib/modules/goals";

let db: Db;
let user: User;
let summary: SimSummary;

beforeAll(async () => {
  db = await openDb();
  user = await createUser(db, { email: "season@example.com", password: "twelve-weeks-sim-1", displayName: "Sim" });
  await seedPlanGoals(db, user.id, "2026-09-07T00:00:00.000Z");
  summary = await simulateSeason(db, user.id, { until: "2026-11-03" });
}, 600_000);

afterAll(async () => {
  await db?.close();
});

describe("a simulated season through the real coach", () => {
  it("runs every day without breaking a rule", () => {
    expect(summary.days).toBe(58);
    expect(summary.runs).toBe(58);
    expect(summary.sessions).toBeGreaterThan(35);
    expect(summary.sets).toBeGreaterThan(600);
  });

  it("switches phases on schedule", async () => {
    const wk2 = await getCurrentRun(db, user.id, "2026-09-17");
    expect(wk2?.output.card.slots.every((s) => s.status === "rampin")).toBe(true);
    const wk3 = await getCurrentRun(db, user.id, "2026-09-21");
    expect(wk3?.output.card.slots.find((s) => s.track === "bench_heavy")?.status).toBe("baseline_test");
    const fri3 = await getCurrentRun(db, user.id, "2026-09-25");
    expect(fri3?.output.card.kind).toBe("rest");
    const sat5 = await getCurrentRun(db, user.id, "2026-10-10");
    expect(sat5?.output.card.slots.map((s) => s.track)).toContain("deadlift");
    expect(sat5?.output.card.slots.find((s) => s.track === "rdl")?.sets).toBe(3);
  });

  it("seeds working loads from the baselines and progresses them", async () => {
    const states = await loadLiftState(db, user.id);
    for (const t of ["bench_heavy", "bench_volume", "ohp", "pullup_weighted", "back_squat", "rdl", "deadlift", "cs_row"]) {
      expect(states[t]?.status, t).toBe("active");
    }
    const runs = await listRuns(db, user.id);
    const increases = runs.flatMap((r) => r.output.changes).filter((c) => c.kind === "load" && c.rule === "P1");
    expect(increases.length).toBeGreaterThan(10);
  });

  it("adds carbs at the first Monday review after a flat fortnight", async () => {
    const oct12 = await getCurrentRun(db, user.id, "2026-10-12");
    expect(oct12?.output.weekly?.status).toBe("change");
    expect(oct12?.output.targets.change).toMatchObject({ rule: "N1", carbsDelta: 25, kcalDelta: 100 });
    const targets = await loadTargets(db, user.id);
    expect(targets.filter((t) => t.source === "coach").map((t) => [t.effectiveDate, t.kcal, t.carbs])).toEqual([["2026-10-12", 2750, 410]]);
    const oct19 = await getCurrentRun(db, user.id, "2026-10-19");
    expect(oct19?.output.weekly?.status).toBe("cooldown");
  });

  it("runs the monthly audit and a clean replay on the first Monday of November", async () => {
    const nov2 = await getCurrentRun(db, user.id, "2026-11-02");
    expect(nov2?.output.monthly?.kind).toBe("monthly");
    expect(nov2?.output.monthly?.status).not.toBe("not_started");
    const replays = await listReviews<ReplayResult>(db, user.id, "replay");
    expect(replays[0].period_date).toBe("2026-11-02");
    expect(replays[0].result.divergences).toEqual([]);
    expect(replays[0].result.checked).toBe(56);
  });

  it("reproduces every prescription exactly on a fresh replay", async () => {
    const r = await replayHistory(db, user.id);
    expect(r.checked).toBe(58);
    expect(r.divergences).toEqual([]);
  });

  it("marks missing mornings and missed sessions instead of guessing", async () => {
    const runs = await listRuns(db, user.id);
    const missing = runs.filter((r) => r.output.missing.some((m) => m.startsWith("No weigh-in")));
    expect(missing.length).toBeGreaterThan(0);
    expect(missing.every((r) => r.output.gate.status !== "open")).toBe(true);
    const skipped = runs.filter((r) => r.output.missing.some((m) => m.startsWith("No session logged")));
    expect(skipped.length).toBeGreaterThan(0);
  });
});
