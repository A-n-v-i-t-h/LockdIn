import { describe, expect, it } from "vitest";
import { bucketOf, isOverdue, sortTasks, validateTask, type Task } from "@/lib/modules/tasks";
import { cleanDays, habitStreak } from "@/lib/modules/habits";
import { goalProgress, nextMilestone, validateGoal, type Goal } from "@/lib/modules/goals";
import { calendarItems, monthGrid, validateCommitment } from "@/lib/modules/calendar";
import { cleanTags, likePattern, validateEntry } from "@/lib/modules/journal";

const task = (over: Partial<Task>): Task => ({
  id: over.title ?? "t",
  title: "t",
  notes: "",
  dueDate: null,
  dueTime: null,
  priority: "none",
  doneAt: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  ...over,
});

describe("tasks", () => {
  it("buckets by due date, with overdue in today", () => {
    expect(bucketOf(task({ dueDate: "2026-10-28" }), "2026-10-29")).toBe("today");
    expect(isOverdue(task({ dueDate: "2026-10-28" }), "2026-10-29")).toBe(true);
    expect(bucketOf(task({ dueDate: "2026-10-30" }), "2026-10-29")).toBe("upcoming");
    expect(bucketOf(task({}), "2026-10-29")).toBe("someday");
    expect(bucketOf(task({ dueDate: "2026-10-28", doneAt: "x" }), "2026-10-29")).toBe("done");
  });

  it("sorts by date, then priority, then time", () => {
    const sorted = sortTasks([
      task({ title: "someday" }),
      task({ title: "buy", dueDate: "2026-10-29", dueTime: "17:30" }),
      task({ title: "bill", dueDate: "2026-10-29", priority: "high" }),
      task({ title: "note", dueDate: "2026-10-29", dueTime: "18:30", priority: "medium" }),
      task({ title: "prep", dueDate: "2026-10-28", dueTime: "21:00" }),
      task({ title: "early", dueDate: "2026-10-29", dueTime: "08:00" }),
    ]);
    expect(sorted.map((t) => t.title)).toEqual(["prep", "bill", "note", "early", "buy", "someday"]);
  });

  it("validates input", () => {
    expect(validateTask({ title: "  " })).toEqual({ ok: false, error: "Give the task a title." });
    expect(validateTask({ title: "x", dueTime: "09:00" })).toEqual({ ok: false, error: "A time needs a date." });
    expect(validateTask({ title: "x", dueDate: "2026-02-30" })).toEqual({ ok: false, error: "That date isn't valid." });
    expect(validateTask({ title: "x", dueDate: "2026-10-29", dueTime: "9:00" })).toEqual({ ok: false, error: "That time isn't valid." });
    expect(validateTask({ title: " Pay ", priority: "urgent" as never })).toMatchObject({ ok: true, value: { title: "Pay", priority: "none" } });
  });
});

describe("habits", () => {
  const daily = { days: [1, 2, 3, 4, 5, 6, 7], createdAt: "2026-10-01T02:00:00.000Z" };
  const weekdays = { days: [1, 2, 3, 4, 5], createdAt: "2026-10-01T02:00:00.000Z" };

  it("counts consecutive done days and doesn't break on a pending today", () => {
    const done = new Set(["2026-10-26", "2026-10-27", "2026-10-28"]);
    expect(habitStreak(daily, done, "2026-10-29")).toEqual({ current: 3, best: 3 });
    expect(habitStreak(daily, new Set([...done, "2026-10-29"]), "2026-10-29")).toEqual({ current: 4, best: 4 });
  });

  it("skips unscheduled days", () => {
    // Thu 22 and Fri 23, then Mon 26 to Wed 28 for a weekday habit: the weekend doesn't break it.
    const done = new Set(["2026-10-22", "2026-10-23", "2026-10-26", "2026-10-27", "2026-10-28"]);
    expect(habitStreak(weekdays, done, "2026-10-29").current).toBe(5);
  });

  it("remembers the best run after a break", () => {
    const done = new Set(["2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-28"]);
    expect(habitStreak(daily, done, "2026-10-29")).toEqual({ current: 1, best: 4 });
  });

  it("counts back-filled days before the habit was created", () => {
    const h = { days: [1, 2, 3, 4, 5, 6, 7], createdAt: "2026-10-29T02:00:00.000Z" };
    expect(habitStreak(h, new Set(["2026-10-28", "2026-10-29"]), "2026-10-29").current).toBe(2);
  });

  it("cleans day lists", () => {
    expect(cleanDays([7, 1, 1, 9, "x"])).toEqual([1, 7]);
    expect(cleanDays([])).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

const goal = (over: Partial<Goal>): Goal => ({
  id: "g",
  title: "g",
  category: "General",
  targetDate: null,
  kind: "manual",
  metric: null,
  startValue: null,
  targetValue: null,
  notes: "",
  createdAt: "",
  achievedAt: null,
  archivedAt: null,
  milestones: [],
  ...over,
});

describe("goals", () => {
  it("measures manual goals by milestones", () => {
    const g = goal({
      milestones: [
        { id: "a", title: "A", sort: 0, doneAt: "x" },
        { id: "b", title: "B", sort: 1, doneAt: null },
        { id: "c", title: "C", sort: 2, doneAt: null },
      ],
    });
    expect(goalProgress(g, { benchE1rm: null, bodyweightAvg: null })).toMatchObject({ pct: 33, label: "1 of 3 milestones" });
    expect(nextMilestone(g)?.title).toBe("B");
    expect(goalProgress(goal({}), { benchE1rm: null, bodyweightAvg: null }).label).toBe("No milestones yet");
  });

  it("measures auto goals from the log", () => {
    const bench = goal({ kind: "auto", metric: "bench_e1rm", startValue: 0, targetValue: 100 });
    expect(goalProgress(bench, { benchE1rm: 63.3, bodyweightAvg: null })).toMatchObject({ pct: 63, label: "Estimated max 63.3 of 100 kg" });
    const weight = goal({ kind: "auto", metric: "bodyweight_avg", startValue: 57.7, targetValue: 65 });
    expect(goalProgress(weight, { benchE1rm: null, bodyweightAvg: 60.1 }).pct).toBe(33);
    expect(goalProgress(weight, { benchE1rm: null, bodyweightAvg: 70 }).pct).toBe(100);
    expect(goalProgress(weight, { benchE1rm: null, bodyweightAvg: null }).label).toBe("No weigh-ins yet");
  });

  it("validates goals", () => {
    const base = {
      title: "x",
      category: "General",
      targetDate: null,
      kind: "manual" as const,
      metric: null,
      startValue: null,
      targetValue: null,
      notes: "",
      milestones: [],
    };
    expect(validateGoal(base)).toBeNull();
    expect(validateGoal({ ...base, kind: "auto" })).toBe("Pick what the goal tracks.");
    expect(validateGoal({ ...base, kind: "auto", metric: "bench_e1rm" })).toBe("Set a target number.");
    expect(validateGoal({ ...base, targetDate: "2026-13-01" })).toBe("That date isn't valid.");
  });
});

describe("calendar", () => {
  it("builds a Monday-first month grid", () => {
    const oct = monthGrid("2026-10-15");
    expect(oct.length % 7).toBe(0);
    expect(oct.slice(0, 4)).toEqual([null, null, null, "2026-10-01"]);
    expect(oct.filter(Boolean)).toHaveLength(31);
    expect(monthGrid("2026-02-01").filter(Boolean)).toHaveLength(28);
  });

  it("collects task and goal deadlines and commitments, in time order", () => {
    const items = calendarItems(
      "2026-10-01",
      "2026-10-31",
      [
        task({ id: "t1", title: "Pay bill", dueDate: "2026-10-29" }),
        task({ id: "t2", title: "Buy food", dueDate: "2026-10-29", dueTime: "17:30" }),
        task({ id: "t3", title: "Later", dueDate: "2026-11-02" }),
      ],
      [goal({ id: "g1", title: "Launch", targetDate: "2026-10-31" }), goal({ id: "g2", title: "Archived", targetDate: "2026-10-30", archivedAt: "x" })],
      [{ id: "c1", title: "Client call", date: "2026-10-29", startTime: "15:00", endTime: "15:30", location: "Meet", notes: "" }],
    );
    expect(items.map((i) => [i.date, i.kind, i.title])).toEqual([
      ["2026-10-29", "commitment", "Client call"],
      ["2026-10-29", "task", "Buy food"],
      ["2026-10-29", "task", "Pay bill"],
      ["2026-10-31", "goal", "Launch"],
    ]);
    expect(items[0].detail).toBe("Commitment · Meet");
  });

  it("validates commitments", () => {
    const base = { title: "Call", date: "2026-10-29", startTime: null, endTime: null, location: "", notes: "" };
    expect(validateCommitment(base)).toBeNull();
    expect(validateCommitment({ ...base, endTime: "10:00" })).toBe("An end time needs a start time.");
    expect(validateCommitment({ ...base, startTime: "10:00", endTime: "09:00" })).toBe("The end has to be after the start.");
    expect(validateCommitment({ ...base, date: "" })).toBe("Pick a date.");
  });
});

describe("journal", () => {
  it("escapes LIKE wildcards", () => {
    expect(likePattern("100%_done\\")).toBe("%100\\%\\_done\\\\%");
  });

  it("cleans tags", () => {
    expect(cleanTags(["training", "Training", " ", "x".repeat(40), "win"])).toEqual(["Training", "Win"]);
    expect(cleanTags("nope")).toEqual([]);
  });

  it("validates entries", () => {
    expect(validateEntry({ entryDate: "2026-10-29", body: "  " })).toBe("Write something first.");
    expect(validateEntry({ entryDate: "x", body: "a" })).toBe("Pick a date.");
    expect(validateEntry({ entryDate: "2026-10-29", body: "a" })).toBeNull();
  });
});
