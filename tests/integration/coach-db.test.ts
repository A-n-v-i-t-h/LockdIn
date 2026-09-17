import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openDb, splitSql, type Db } from "@/lib/db";
import { LOCK_DOWN_SQL, MIGRATIONS } from "@/lib/db/migrations";
import { attemptLogin, changePassword, createUser, bumpSessionVersion, LOCKOUT, type User } from "@/lib/auth/users";
import { compareOutputs, loadEngineInput, replayHistory, runCoach } from "@/lib/fitness/agent";
import {
  addOverride,
  getCurrentRun,
  listReviews,
  listRuns,
  loadLiftState,
  loadMeasurements,
  loadSets,
  loadSettings,
  loadTargets,
  loadWeighIns,
  logSet,
  removeSet,
  saveMeasurement,
  saveNutrition,
  saveSetting,
  saveWeighIn,
  sessionSets,
  startSession,
  validateSetInput,
} from "@/lib/fitness/repo";
import { DEFAULT_GYM } from "@/lib/fitness/equipment";
import { addDays, toInstant } from "@/lib/time";

let db: Db;
let user: User;

const at = (date: string, hhmm: string) => toInstant(date, hhmm);
const iso = (date: string, hhmm: string) => at(date, hhmm).toISOString();

beforeAll(async () => {
  db = await openDb();
  user = await createUser(db, { email: "Athlete@Example.com", password: "plate-rack-bench-9", displayName: "Anvith" });
});

afterAll(async () => {
  await db?.close();
});

describe("schema", () => {
  it("applies migrations once and is idempotent", async () => {
    expect(await migrate(db)).toEqual([]);
    const versions = await db.query<{ version: string }>("select version from schema_migrations order by version");
    expect(versions.map((v) => v.version)).toEqual(MIGRATIONS.map((m) => m.version));
  });

  it("enables row level security on every table", async () => {
    const rows = await db.query<{ tablename: string; rowsecurity: boolean }>(
      "select tablename, rowsecurity from pg_tables where schemaname = 'public'",
    );
    expect(rows.length).toBeGreaterThan(15);
    expect(rows.filter((r) => !r.rowsecurity)).toEqual([]);
  });

  it("locks the Data API roles out when they exist (Supabase)", async () => {
    await db.query("create role anon nologin");
    await db.query("create role authenticated nologin");
    await db.query("grant select on all tables in schema public to anon, authenticated");
    for (const s of splitSql(LOCK_DOWN_SQL)) await db.query(s);
    await expect(db.tx(async (q) => {
      await q.query("set local role anon");
      return q.query("select count(*) from weigh_ins");
    })).rejects.toThrow(/permission denied/);
  });

  it("splits SQL scripts without breaking DO blocks", () => {
    const parts = splitSql("create table a (x int);\n-- note\ndo $$\nbegin\n  perform 1;\nend $$;\nselect 1;");
    expect(parts).toHaveLength(3);
    expect(parts[1]).toContain("perform 1;");
  });

  it("rejects out-of-range values at the database", async () => {
    await expect(
      db.query("insert into weigh_ins (user_id, date, weight_kg) values ($1, '2026-10-01', 400)", [user.id]),
    ).rejects.toThrow();
    await expect(
      db.query("insert into tasks (user_id, title, due_time) values ($1, 'x', '25:00')", [user.id]),
    ).rejects.toThrow();
  });
});

describe("accounts", () => {
  it("normalises email and refuses duplicates", async () => {
    expect(user.email).toBe("athlete@example.com");
    await expect(createUser(db, { email: "ATHLETE@example.com", password: "another-good-pass-1", displayName: "x" })).rejects.toThrow();
  });

  it("signs in with the right password only", async () => {
    const ok = await attemptLogin(db, { email: " athlete@EXAMPLE.com ", password: "plate-rack-bench-9", ip: "1.1.1.1" });
    expect(ok).toMatchObject({ ok: true, user: { id: user.id } });
    expect(await attemptLogin(db, { email: "athlete@example.com", password: "wrong", ip: "1.1.1.1" })).toEqual({ ok: false, reason: "invalid" });
    expect(await attemptLogin(db, { email: "nobody@example.com", password: "whatever", ip: "1.1.1.1" })).toEqual({ ok: false, reason: "invalid" });
  });

  it("locks an email after repeated failures and unlocks after the window", async () => {
    const t0 = new Date("2030-01-01T00:00:00Z");
    for (let i = 0; i < LOCKOUT.maxFailuresPerEmail; i++) {
      await attemptLogin(db, { email: "athlete@example.com", password: `bad-${i}`, ip: `9.9.9.${i}` }, new Date(t0.getTime() + i * 1000));
    }
    const locked = await attemptLogin(db, { email: "athlete@example.com", password: "plate-rack-bench-9", ip: "8.8.8.8" }, new Date(t0.getTime() + 10_000));
    expect(locked).toMatchObject({ ok: false, reason: "locked" });
    const later = await attemptLogin(db, { email: "athlete@example.com", password: "plate-rack-bench-9", ip: "8.8.8.8" }, new Date(t0.getTime() + 16 * 60_000));
    expect(later.ok).toBe(true);
  });

  it("locks an IP that sprays many accounts", async () => {
    const t0 = new Date("2031-01-01T00:00:00Z");
    for (let i = 0; i < LOCKOUT.maxFailuresPerIp; i++) {
      await attemptLogin(db, { email: `spray${i}@example.com`, password: "x", ip: "6.6.6.6" }, new Date(t0.getTime() + i * 1000));
    }
    const r = await attemptLogin(db, { email: "athlete@example.com", password: "plate-rack-bench-9", ip: "6.6.6.6" }, new Date(t0.getTime() + 30_000));
    expect(r).toMatchObject({ ok: false, reason: "locked" });
  });

  it("changes the password and invalidates old sessions", async () => {
    const other = await createUser(db, { email: "second@example.com", password: "first-password-11", displayName: "B" });
    expect(await changePassword(db, other.id, "wrong-current", "brand-new-pass-22")).toEqual({ ok: false, error: "Current password is wrong." });
    expect((await changePassword(db, other.id, "first-password-11", "short")).ok).toBe(false);
    const done = await changePassword(db, other.id, "first-password-11", "brand-new-pass-22");
    expect(done).toMatchObject({ ok: true, user: { sessionVersion: other.sessionVersion + 1 } });
    expect((await attemptLogin(db, { email: "second@example.com", password: "brand-new-pass-22", ip: "2.2.2.2" })).ok).toBe(true);
    expect(await bumpSessionVersion(db, other.id)).toBe(other.sessionVersion + 2);
  });
});

describe("append-only fitness log", () => {
  it("keeps every version of a weigh-in and reads any past moment", async () => {
    const first = await saveWeighIn(db, user.id, { date: "2026-09-21", weight: 59.4, protocolOk: true, bedAt: iso("2026-09-20", "23:30"), wakeAt: iso("2026-09-21", "07:00") }, iso("2026-09-21", "07:10"));
    const second = await saveWeighIn(db, user.id, { date: "2026-09-21", weight: 59.6, protocolOk: true, bedAt: iso("2026-09-20", "23:30"), wakeAt: iso("2026-09-21", "07:00") }, iso("2026-09-21", "07:20"));
    expect(first).not.toBe(second);
    expect((await loadWeighIns(db, user.id)).map((w) => w.weight)).toEqual([59.6]);
    expect((await loadWeighIns(db, user.id, iso("2026-09-21", "07:15"))).map((w) => w.weight)).toEqual([59.4]);
    expect(await loadWeighIns(db, user.id, iso("2026-09-21", "07:00"))).toEqual([]);
    const all = await db.query<{ n: number }>("select count(*)::int as n from weigh_ins where user_id = $1", [user.id]);
    expect(all[0].n).toBe(2);
  });

  it("clears a measurement without losing its history", async () => {
    await saveMeasurement(db, user.id, { date: "2026-09-21", kind: "waist", valueCm: 74 }, iso("2026-09-21", "07:12"));
    await saveMeasurement(db, user.id, { date: "2026-09-21", kind: "waist", valueCm: null }, iso("2026-09-21", "07:13"));
    expect(await loadMeasurements(db, user.id)).toEqual([]);
    expect((await loadMeasurements(db, user.id, iso("2026-09-21", "07:12"))).map((m) => m.valueCm)).toEqual([74]);
    await saveMeasurement(db, user.id, { date: "2026-09-21", kind: "waist", valueCm: 74.5 }, iso("2026-09-21", "07:14"));
    await expect(saveMeasurement(db, user.id, { date: "2026-09-21", kind: "belly" as never, valueCm: 1 }, iso("2026-09-21", "07:15"))).rejects.toThrow();
  });

  it("versions set logs and removes them as history", async () => {
    const session = await startSession(db, user.id, { date: "2026-09-21", sessionKey: "push_a", runId: null }, iso("2026-09-21", "18:00"));
    const again = await startSession(db, user.id, { date: "2026-09-21", sessionKey: "push_a", runId: null }, iso("2026-09-21", "18:01"));
    expect(again.id).toBe(session.id);
    const base = { slot: "1", exercise: "bench_press", track: "bench_heavy", substituteFor: null };
    for (const [i, w] of [30, 35, 40, 42.5].entries()) {
      await logSet(db, user.id, session, { ...base, setIndex: i + 1, weight: w, reps: 8 }, iso("2026-09-21", `18:1${i}`));
    }
    await logSet(db, user.id, session, { ...base, setIndex: 4, weight: 42.5, reps: 9 }, iso("2026-09-21", "18:20"));
    await logSet(db, user.id, session, { ...base, setIndex: 5, weight: 45, reps: 4 }, iso("2026-09-21", "18:21"));
    expect(await removeSet(db, user.id, session.id, "1", 5, iso("2026-09-21", "18:22"))).toBe(true);
    expect(await removeSet(db, user.id, session.id, "1", 5, iso("2026-09-21", "18:23"))).toBe(false);
    const current = await sessionSets(db, user.id, session.id);
    expect(current.map((s) => [s.setIndex, s.weight, s.reps])).toEqual([
      [1, 30, 8],
      [2, 35, 8],
      [3, 40, 8],
      [4, 42.5, 9],
    ]);
    const asOf = await loadSets(db, user.id, iso("2026-09-21", "18:21"));
    expect(asOf.map((s) => s.reps)).toEqual([8, 8, 8, 9, 4]);
    const beforeEdit = await loadSets(db, user.id, iso("2026-09-21", "18:15"));
    expect(beforeEdit.map((s) => s.reps)).toEqual([8, 8, 8, 8]);
  });

  it("validates set input", () => {
    const ok = { slot: "1", exercise: "bench_press", track: "bench_heavy", substituteFor: null, setIndex: 1, weight: 40, reps: 8 };
    expect(validateSetInput(ok)).toBeNull();
    expect(validateSetInput({ ...ok, exercise: "curl_in_squat_rack" })).toBe("Unknown exercise.");
    expect(validateSetInput({ ...ok, track: "nope" })).toBe("Unknown track.");
    expect(validateSetInput({ ...ok, reps: 1.5 })).toBe("Reps must be 0–100.");
    expect(validateSetInput({ ...ok, weight: null })).toBe("Enter a weight.");
    expect(validateSetInput({ ...ok, exercise: "hanging_leg_raise", track: "hanging_leg_raise", weight: null })).toBeNull();
    expect(validateSetInput({ ...ok, slot: "1; drop" })).toBe("Bad slot.");
  });

  it("versions settings", async () => {
    await saveSetting(db, user.id, "gym", { ...DEFAULT_GYM, plates: [20, 10, 5, 2.5] }, iso("2026-09-21", "20:00"));
    expect((await loadSettings(db, user.id)).gym.plates).toEqual([20, 10, 5, 2.5]);
    expect((await loadSettings(db, user.id, iso("2026-09-21", "19:00"))).gym.plates).toEqual(DEFAULT_GYM.plates);
    await saveSetting(db, user.id, "gym", DEFAULT_GYM, iso("2026-09-21", "20:05"));
    await saveSetting(db, user.id, "schedule", { buildRestDay: 9 }, iso("2026-09-21", "20:06"));
    expect((await loadSettings(db, user.id)).schedule.buildRestDay).toBe(5);
  });
});

describe("coach runs", () => {
  // Every write below happens before any run whose as-of is later than the write's
  // timestamp, as in real life. Backdated rows would (rightly) show up as drift.
  beforeAll(async () => {
    for (const d of ["2026-09-21"]) await saveNutrition(db, user.id, { date: d, kcal: 2650, protein: 120, carbs: 385, fat: 70 }, iso(d, "22:00"));
  });

  it("creates a run, then only a new revision when inputs change", async () => {
    const first = await runCoach(db, user.id, { trigger: "checkin", at: at("2026-09-22", "07:30") });
    expect(first.created).toBe(true);
    expect(first.run).toMatchObject({ runDate: "2026-09-22", revision: 1, rulesVersion: "v1" });
    expect(first.run.output.card.session?.key).toBe("pull_a");
    const same = await runCoach(db, user.id, { trigger: "cron", at: at("2026-09-22", "10:00") });
    expect(same).toMatchObject({ created: false, run: { id: first.run.id } });
    const view = await runCoach(db, user.id, { trigger: "view", at: at("2026-09-22", "10:05") });
    expect(view.created).toBe(false);

    await saveWeighIn(db, user.id, { date: "2026-09-22", weight: 59.8, protocolOk: true, bedAt: iso("2026-09-21", "23:00"), wakeAt: iso("2026-09-22", "07:00") }, iso("2026-09-22", "10:10"));
    const second = await runCoach(db, user.id, { trigger: "checkin", at: at("2026-09-22", "10:11") });
    expect(second.run.revision).toBe(2);
    expect(second.run.output.morning.weight).toBe(59.8);
    expect((await getCurrentRun(db, user.id, "2026-09-22"))?.id).toBe(second.run.id);
    const states = await loadLiftState(db, user.id);
    expect(states.bench_heavy).toMatchObject({ weight: 47.5, seed: "baseline" });
  });

  it("writes the calorie change of a Monday review once, whatever the revision", async () => {
    // Three weeks of flat weigh-ins, food logged, waist on the review Monday.
    await saveNutrition(db, user.id, { date: "2026-09-22", kcal: 2650, protein: 120, carbs: 385, fat: 70 }, iso("2026-09-22", "22:00"));
    for (let d = "2026-09-23"; d <= "2026-10-11"; d = addDays(d, 1)) {
      await saveWeighIn(db, user.id, { date: d, weight: 59.8, protocolOk: true, bedAt: `${addDays(d, -1)}T17:30:00.000Z`, wakeAt: `${d}T01:30:00.000Z` }, iso(d, "07:05"));
      await saveNutrition(db, user.id, { date: d, kcal: 2650, protein: 120, carbs: 385, fat: 70 }, iso(d, "22:00"));
    }
    await saveWeighIn(db, user.id, { date: "2026-10-12", weight: 59.8, protocolOk: true, bedAt: iso("2026-10-11", "23:00"), wakeAt: iso("2026-10-12", "07:00") }, iso("2026-10-12", "07:05"));
    await saveMeasurement(db, user.id, { date: "2026-10-12", kind: "waist", valueCm: 74.5 }, iso("2026-10-12", "07:06"));

    const r1 = await runCoach(db, user.id, { trigger: "checkin", at: at("2026-10-12", "07:10") });
    expect(r1.run.output.weekly?.status).toBe("change");
    expect(r1.run.output.targets.change?.to).toMatchObject({ kcal: 2750, carbs: 410 });
    let targets = await loadTargets(db, user.id);
    expect(targets.filter((t) => t.source === "coach").map((t) => [t.effectiveDate, t.kcal])).toEqual([["2026-10-12", 2750]]);

    await saveWeighIn(db, user.id, { date: "2026-10-12", weight: 59.9, protocolOk: true, bedAt: iso("2026-10-11", "23:00"), wakeAt: iso("2026-10-12", "07:00") }, iso("2026-10-12", "07:20"));
    const r2 = await runCoach(db, user.id, { trigger: "checkin", at: at("2026-10-12", "07:21") });
    expect(r2.run.revision).toBe(r1.run.revision + 1);
    expect(r2.run.output.targets.change?.to.kcal).toBe(2750);
    targets = await loadTargets(db, user.id);
    expect(targets.filter((t) => t.source === "coach")).toHaveLength(1);

    const weekly = await listReviews(db, user.id, "weekly");
    expect(weekly[0]).toMatchObject({ period_date: "2026-10-12" });
    expect(weekly.filter((w) => w.period_date === "2026-10-12")).toHaveLength(1);

    // The next day inherits the new targets and doesn't re-announce the change.
    await saveNutrition(db, user.id, { date: "2026-10-12", kcal: 2750, protein: 120, carbs: 410, fat: 70 }, iso("2026-10-12", "22:00"));
    await saveWeighIn(db, user.id, { date: "2026-10-13", weight: 59.9, protocolOk: true, bedAt: iso("2026-10-12", "23:00"), wakeAt: iso("2026-10-13", "07:00") }, iso("2026-10-13", "07:05"));
    const tue = await runCoach(db, user.id, { trigger: "cron", at: at("2026-10-13", "10:00") });
    expect(tue.run.output.targets.current).toMatchObject({ kcal: 2750, carbs: 410, source: "coach" });
    expect(tue.run.output.changes.filter((c) => c.kind === "calories")).toEqual([]);
  });

  it("logs an override as a change and applies it from its date", async () => {
    await addOverride(db, user.id, { date: "2026-10-14", target: "track:bench_volume", field: "weight", value: 40, reason: "Elbow" }, iso("2026-10-14", "07:00"));
    await saveWeighIn(db, user.id, { date: "2026-10-14", weight: 60, protocolOk: true, bedAt: iso("2026-10-13", "23:00"), wakeAt: iso("2026-10-14", "07:00") }, iso("2026-10-14", "07:05"));
    const r = await runCoach(db, user.id, { trigger: "override", at: at("2026-10-15", "07:00") });
    const bench = r.run.output.card.slots.find((s) => s.track === "bench_volume")!;
    expect(bench.weight).toBe(40);
    expect(bench.change).toMatchObject({ rule: "O1", to: 40 });
    expect(r.run.output.changes.map((c) => c.rule)).toContain("O1");
  });

  it("replays every stored prescription without drift", async () => {
    const result = await replayHistory(db, user.id);
    expect(result.checked).toBeGreaterThanOrEqual(4);
    expect(result.divergences).toEqual([]);
  });

  it("detects drift when history is rewritten behind the coach's back", async () => {
    const other = await createUser(db, { email: "drift@example.com", password: "rewrite-check-77", displayName: "D" });
    const s = await startSession(db, other.id, { date: "2026-09-21", sessionKey: "push_a", runId: null }, iso("2026-09-21", "18:00"));
    await logSet(db, other.id, s, { slot: "1", exercise: "bench_press", track: "bench_heavy", substituteFor: null, setIndex: 1, weight: 40, reps: 8 }, iso("2026-09-21", "18:05"));
    await runCoach(db, other.id, { trigger: "cron", at: at("2026-09-22", "10:00") });
    // A direct database edit, not an append: exactly what the replay test exists to catch.
    await db.query("update set_logs set weight_kg = 60 where user_id = $1", [other.id]);
    const result = await replayHistory(db, other.id);
    expect(result.divergent).toBe(1);
    expect(result.divergences.map((d) => d.field)).toEqual(["inputs", "states"]);
  });

  it("runs the monthly replay on the first Monday and stores it", async () => {
    for (let d = "2026-10-15"; d <= "2026-11-02"; d = addDays(d, 1)) {
      await saveWeighIn(db, user.id, { date: d, weight: 60.2, protocolOk: true, bedAt: `${addDays(d, -1)}T17:30:00.000Z`, wakeAt: `${d}T01:30:00.000Z` }, iso(d, "07:05"));
    }
    const r = await runCoach(db, user.id, { trigger: "cron", at: at("2026-11-02", "10:00") });
    expect(r.run.output.replayDue).toBe(true);
    expect(r.run.output.monthly?.kind).toBe("monthly");
    const replays = await listReviews<{ checked: number; divergent: number }>(db, user.id, "replay");
    expect(replays[0]).toMatchObject({ period_date: "2026-11-02", result: { divergent: 0 } });
    expect(replays[0].result.checked).toBeGreaterThan(0);
  });

  it("keeps users' data apart", async () => {
    const stranger = await createUser(db, { email: "stranger@example.com", password: "isolation-check-5", displayName: "S" });
    expect(await loadWeighIns(db, stranger.id)).toEqual([]);
    expect(await listRuns(db, stranger.id)).toEqual([]);
    const input = await loadEngineInput(db, stranger.id, "2026-10-15", new Date().toISOString());
    expect(input.sets).toEqual([]);
    // A session links only to the account's own coach run.
    const theirs = (await listRuns(db, user.id))[0];
    const borrowed = await startSession(db, stranger.id, { date: "2026-10-14", sessionKey: "legs_q", runId: theirs.id }, iso("2026-10-14", "18:00"));
    expect(borrowed.runId).toBeNull();
    const own = (await runCoach(db, stranger.id, { trigger: "cron", at: at("2026-10-15", "10:00") })).run;
    const linked = await startSession(db, stranger.id, { date: "2026-10-15", sessionKey: "push_b", runId: own.id }, iso("2026-10-15", "18:00"));
    expect(linked.runId).toBe(own.id);
  });

  it("compares outputs field by field", async () => {
    const run = (await listRuns(db, user.id))[0];
    expect(compareOutputs(run.output, run.output)).toEqual([]);
    const changed = structuredClone(run.output);
    changed.gate.status = changed.gate.status === "open" ? "closed" : "open";
    expect(compareOutputs(run.output, changed).map((d) => d.field)).toEqual(["gate"]);
  });
});
