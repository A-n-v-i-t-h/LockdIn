// Sample tasks, habits, goals, commitments and journal entries for demos and
// browser tests. Dated relative to `today`.
import type { Queryable } from "@/lib/db";
import { addDays, toInstant } from "@/lib/time";
import { createTask, setTaskDone } from "@/lib/modules/tasks";
import { createHabit, setHabitDay } from "@/lib/modules/habits";
import { addMilestone, createGoal, listGoals, setMilestoneDone } from "@/lib/modules/goals";
import { createCommitment } from "@/lib/modules/calendar";
import { createEntry } from "@/lib/modules/journal";

export async function seedDemoContent(q: Queryable, userId: string, today: string): Promise<void> {
  const early = toInstant(addDays(today, -30), "08:00").toISOString();
  const at = (d: string, t = "09:00") => toInstant(d, t).toISOString();

  await createTask(q, userId, { title: "Pay electricity bill", notes: "", dueDate: today, dueTime: null, priority: "high" }, early);
  await createTask(q, userId, { title: "Buy chicken, eggs and curd", notes: "", dueDate: today, dueTime: "17:30", priority: "none" }, early);
  await createTask(q, userId, { title: "Note plate and cable increments at the gym", notes: "", dueDate: today, dueTime: "18:30", priority: "medium" }, early);
  await createTask(q, userId, { title: "Prep 5 meals for Fri and Sat", notes: "", dueDate: addDays(today, -1), dueTime: "21:00", priority: "none" }, early);
  await createTask(q, userId, { title: "Renew gym membership", notes: "", dueDate: addDays(today, 2), dueTime: null, priority: "medium" }, early);
  await createTask(q, userId, { title: "Read about sleep hygiene", notes: "", dueDate: null, dueTime: null, priority: "low" }, early);
  const done = await createTask(q, userId, { title: "Book a haircut", notes: "", dueDate: addDays(today, -2), dueTime: null, priority: "none" }, early);
  await setTaskDone(q, userId, done, true, at(addDays(today, -2)));

  const habits = [
    { name: "Read 20 pages", days: [1, 2, 3, 4, 5, 6, 7], miss: [5, 13] },
    { name: "Journal before bed", days: [1, 2, 3, 4, 5, 6, 7], miss: [9] },
    { name: "In bed by midnight", days: [1, 2, 3, 4, 5, 6, 7], miss: [2, 6] },
    { name: "No phone for the first 30 min", days: [1, 2, 3, 4, 5], miss: [4] },
  ];
  for (const h of habits) {
    const id = await createHabit(q, userId, h.name, h.days, toInstant(addDays(today, -21), "08:00").toISOString());
    for (let k = 1; k <= 20; k++) {
      if (h.miss.includes(k)) continue;
      await setHabitDay(q, userId, id, addDays(today, -k), true, at(addDays(today, -k), "22:00"));
    }
  }

  const launch = await createGoal(
    q,
    userId,
    {
      title: "Launch LockdIn AI",
      category: "Build",
      targetDate: addDays(today, 32),
      kind: "manual",
      metric: null,
      startValue: null,
      targetValue: null,
      notes: "",
      milestones: ["Pick the design", "Build the screens", "Deploy", "Two weeks of daily use", "Hook up the coach", "Review with the plan"],
    },
    early,
  );
  const books = await createGoal(
    q,
    userId,
    { title: "Read 12 books", category: "Mind", targetDate: "2026-12-31", kind: "manual", metric: null, startValue: null, targetValue: null, notes: "", milestones: [] },
    early,
  );
  for (let b = 1; b <= 12; b++) await addMilestone(q, userId, books, `Book ${b}`, early);
  const goals = await listGoals(q, userId);
  for (const g of goals) {
    if (g.id === launch) for (const m of g.milestones.slice(0, 2)) await setMilestoneDone(q, userId, m.id, true, early);
    if (g.id === books) for (const m of g.milestones.slice(0, 9)) await setMilestoneDone(q, userId, m.id, true, early);
  }

  await createCommitment(q, userId, { title: "Client call", date: today, startTime: "15:00", endTime: "15:30", location: "Google Meet", notes: "" }, early);
  await createCommitment(q, userId, { title: "Monthly tape and photos", date: addDays(today, 4), startTime: "07:30", endTime: null, location: "", notes: "" }, early);
  await createCommitment(q, userId, { title: "Dentist", date: addDays(today, -3), startTime: "10:00", endTime: "10:45", location: "", notes: "" }, early);

  const journal = [
    { d: -1, tags: ["Training"], body: "Squats finally felt smooth. Bench technique sets were quick and clean. In bed at 11:40." },
    { d: -2, tags: ["Win"], body: "Pull-ups with weight added, six reps on all four sets. Closest I have been to December." },
    { d: -3, tags: ["Training"], body: "Dentist in the morning, heavy bench at night. Heavy but clean." },
    { d: -4, tags: ["Reflection"], body: "Forty-minute walk. Planned the week and finished groceries." },
  ];
  for (const j of journal) {
    await createEntry(q, userId, { entryDate: addDays(today, j.d), body: j.body, tags: j.tags }, at(addDays(today, j.d), "22:30"));
  }
}
