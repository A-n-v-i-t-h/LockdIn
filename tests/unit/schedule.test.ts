import { describe, expect, it } from "vitest";
import { dayPlan, isRampIn, nextDateForTrack, phaseOf, slotReps, slotSets, slotWarmups, weekNumber } from "@/lib/fitness/schedule";
import { SESSIONS, TRACKS, EXERCISES, substituteTrack, parseSubstituteTrack, schemeForTrack, rirValue, restSeconds } from "@/lib/fitness/program";

describe("program calendar", () => {
  it("numbers weeks from Monday 7 September", () => {
    expect(weekNumber("2026-09-06")).toBe(0);
    expect(weekNumber("2026-09-07")).toBe(1);
    expect(weekNumber("2026-09-20")).toBe(2);
    expect(weekNumber("2026-09-21")).toBe(3);
    expect(weekNumber("2026-10-05")).toBe(5);
    expect(weekNumber("2026-10-29")).toBe(8);
  });

  it("assigns the ramp-in, baseline, build and full phases", () => {
    expect(phaseOf("2026-09-17")).toBe("rampin");
    expect(phaseOf("2026-09-21")).toBe("baseline");
    expect(phaseOf("2026-09-28")).toBe("build");
    expect(phaseOf("2026-10-05")).toBe("full");
    expect(isRampIn("2026-09-20")).toBe(true);
    expect(isRampIn("2026-09-21")).toBe(false);
  });

  it("runs the fixed weekday split with Sunday off", () => {
    const names = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"].map((d) => {
      const p = dayPlan(d);
      return p.kind === "train" ? p.session.key : p.kind;
    });
    expect(names).toEqual(["push_a", "pull_a", "legs_q", "push_b", "pull_b", "legs_p", "rest"]);
  });

  it("runs five days in weeks 3–4 and six from week 5", () => {
    expect(dayPlan("2026-09-25").kind).toBe("rest"); // Friday, week 3
    expect(dayPlan("2026-10-02").kind).toBe("rest"); // Friday, week 4
    expect(dayPlan("2026-10-09").kind).toBe("train"); // Friday, week 5
    expect(dayPlan("2026-09-25", { buildRestDay: 4 }).kind).toBe("train");
    expect(dayPlan("2026-09-24", { buildRestDay: 4 }).kind).toBe("rest");
    const trainingDays = ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27"].filter(
      (d) => dayPlan(d).kind === "train",
    );
    expect(trainingDays).toHaveLength(5);
  });

  it("marks ramp-in days optional (trainer block runs 3–4 days)", () => {
    const p = dayPlan("2026-09-17");
    expect(p.kind).toBe("train");
    if (p.kind === "train") expect(p.optionalDay).toBe(true);
    const q = dayPlan("2026-09-21");
    if (q.kind === "train") expect(q.optionalDay).toBe(false);
  });

  it("keeps the deadlift out until week 5 and RDL at 4 sets until then", () => {
    const sat = SESSIONS.find((s) => s.key === "legs_p")!;
    const dl = sat.slots.find((s) => s.track === "deadlift")!;
    const rdl = sat.slots.find((s) => s.track === "rdl")!;
    expect(slotSets(dl, "2026-10-03")).toBeNull();
    expect(slotSets(dl, "2026-10-10")).toBe(3);
    expect(slotSets(rdl, "2026-09-26")).toBe(4);
    expect(slotSets(rdl, "2026-10-03")).toBe(4);
    expect(slotSets(rdl, "2026-10-10")).toBe(3);
  });

  it("uses two sets per exercise during ramp-in", () => {
    const mon = SESSIONS[0];
    expect(slotSets(mon.slots[0], "2026-09-14")).toBe(2);
    expect(slotSets(mon.slots[0], "2026-09-21")).toBe(4);
  });

  it("finds the next date a track is trained", () => {
    expect(nextDateForTrack("bench_volume", "2026-10-08")).toBe("2026-10-15");
    expect(nextDateForTrack("cable_lateral_raise", "2026-10-05")).toBe("2026-10-08");
    expect(nextDateForTrack("pullup_bw", "2026-09-22")).toBe("2026-10-09"); // Fridays off in weeks 3–4
    expect(nextDateForTrack("deadlift", "2026-09-26")).toBe("2026-10-10");
  });
});

describe("Training01 data", () => {
  // His 22 Sep cut: 4-set lifts became 1 warm-up + 3 working from that day, and
  // Wednesday's speed bench went. Both counts are asserted, because the old week still replays.
  const working = (keys: string[], date: string) =>
    SESSIONS.flatMap((s) => s.slots)
      .filter((sl) => keys.includes(sl.exercise))
      .reduce((a, sl) => a + (slotSets(sl, date) ?? 0), 0);
  const BEFORE = "2026-09-21";
  const AFTER = "2026-10-06";

  it("matched the plan's weekly set counts until 22 September", () => {
    expect(working(["cable_lateral_raise", "db_lateral_raise", "lean_away_lateral"], BEFORE)).toBe(16);
    expect(working(["incline_db_curl", "preacher_curl", "face_away_curl", "hammer_curl", "spider_curl"], BEFORE)).toBe(17);
    expect(working(["oh_cable_ext", "cable_kickback", "db_skullcrusher", "cable_pressdown"], BEFORE)).toBe(14);
    expect(working(["neck"], BEFORE)).toBe(6);
    expect(working(["wrist_curl", "reverse_wrist_curl"], BEFORE)).toBe(6);
    expect(working(["bench_press"], BEFORE)).toBe(13); // heavy 4 + speed 5 + volume 4
  });

  it("counts his cut from 22 September: 1 warm-up + 3 working, and no speed bench", () => {
    expect(working(["cable_lateral_raise", "db_lateral_raise", "lean_away_lateral"], AFTER)).toBe(12);
    expect(working(["incline_db_curl", "preacher_curl", "face_away_curl", "hammer_curl", "spider_curl"], AFTER)).toBe(15);
    expect(working(["oh_cable_ext", "cable_kickback", "db_skullcrusher", "cable_pressdown"], AFTER)).toBe(12);
    expect(working(["bench_press"], AFTER)).toBe(6); // heavy 3 + volume 3, speed gone
    const wed = SESSIONS.find((s) => s.key === "legs_q")!;
    const speed = wed.slots.find((sl) => sl.track === "bench_speed")!;
    expect(slotSets(speed, BEFORE)).toBe(5);
    expect(slotSets(speed, AFTER)).toBeNull();
    expect(wed.focus).toBe("Quads");
  });

  it("prescribes warm-up sets from 22 September, on the compounds only", () => {
    const bench = SESSIONS[0].slots.find((sl) => sl.track === "bench_heavy")!;
    expect(slotWarmups(bench, BEFORE)).toBe(0);
    expect(slotWarmups(bench, AFTER)).toBe(1);
    const kickback = SESSIONS[0].slots.find((sl) => sl.track === "cable_kickback")!;
    expect(slotWarmups(kickback, AFTER)).toBe(0);
    const withWarmups = SESSIONS.flatMap((s) => s.slots).filter((sl) => slotWarmups(sl, AFTER) > 0);
    expect(withWarmups).toHaveLength(8);
  });

  it("keeps the old rep ranges for past days", () => {
    const pullup = SESSIONS[1].slots.find((sl) => sl.track === "pullup_weighted")!;
    expect(slotReps(pullup, BEFORE)).toEqual([4, 6]);
    expect(slotReps(pullup, AFTER)).toEqual([4, 8]);
    const legExt = SESSIONS[5].slots.find((sl) => sl.track === "leg_extension")!;
    expect(slotReps(legExt, BEFORE)).toEqual([12, 15]);
    expect(slotReps(legExt, AFTER)).toEqual([8, 12]);
  });

  it("gives every exercise on the card a known substitute with its own track", () => {
    for (const s of SESSIONS) {
      for (const sl of s.slots) {
        const ex = EXERCISES[sl.exercise];
        expect(ex, sl.exercise).toBeDefined();
        expect(ex.substitute, `${sl.exercise} substitute`).toBeDefined();
        expect(EXERCISES[ex.substitute!], ex.substitute).toBeDefined();
        const sub = substituteTrack(ex.substitute!, sl.track);
        expect(parseSubstituteTrack(sub)).toEqual({ mainTrack: sl.track, exercise: ex.substitute });
        expect(schemeForTrack(sub)).toEqual(TRACKS[sl.track].slot);
      }
    }
  });

  it("keeps the bench three times a week and no shrugs", () => {
    const bench = SESSIONS.flatMap((s) => s.slots.filter((sl) => sl.exercise === "bench_press").map(() => s.key));
    expect(bench).toEqual(["push_a", "legs_q", "push_b"]);
    expect(Object.keys(EXERCISES).some((k) => k.includes("shrug"))).toBe(false);
  });

  it("parses RIR and rest text", () => {
    expect(rirValue("1–2")).toBe(1.5);
    expect(rirValue("—")).toBe(2);
    expect(restSeconds("2–3 min")).toBe(150);
    expect(restSeconds("90 s")).toBe(90);
    expect(restSeconds("—")).toBe(0);
  });
});

describe("moving and skipping a day", () => {
  const key = (d: string, s: Parameters<typeof dayPlan>[1]) => {
    const p = dayPlan(d, s);
    return p.kind === "train" ? p.session.key : p.reason;
  };
  const at = (n: number) => `2026-10-0${n}T01:00:00.000Z`;
  // Week 6: Mon 12 Oct – Sun 18 Oct, six days.

  it("moves a session onto Sunday and leaves its day as rest", () => {
    const s = { buildRestDay: 5, changes: [{ id: "a", kind: "move" as const, date: "2026-10-14", toDate: "2026-10-18", recordedAt: at(1) }] };
    expect(key("2026-10-14", s)).toBe("moved");
    expect(key("2026-10-18", s)).toBe("legs_q");
    const sun = dayPlan("2026-10-18", s);
    if (sun.kind === "train") expect(sun.movedFrom).toBe("2026-10-14");
    const wed = dayPlan("2026-10-14", s);
    if (wed.kind === "rest") expect(wed.movedTo).toBe("2026-10-18");
    // Other days and other weeks are untouched.
    expect(key("2026-10-15", s)).toBe("push_b");
    expect(key("2026-10-21", s)).toBe("legs_q");
  });

  it("swaps two sessions when the target day has one", () => {
    const s = { buildRestDay: 5, changes: [{ id: "a", kind: "move" as const, date: "2026-10-12", toDate: "2026-10-13", recordedAt: at(1) }] };
    expect(key("2026-10-12", s)).toBe("pull_a");
    expect(key("2026-10-13", s)).toBe("push_a");
  });

  it("skips a session: rest, and its lifts are next due in the following week", () => {
    const s = { buildRestDay: 5, changes: [{ id: "a", kind: "skip" as const, date: "2026-10-12", recordedAt: at(1) }] };
    expect(key("2026-10-12", s)).toBe("skipped");
    const benchTrack = SESSIONS.find((x) => x.key === "push_a")!.slots[0].track;
    expect(nextDateForTrack(benchTrack, "2026-10-11", s)).not.toBe("2026-10-12");
  });

  it("applies changes in the order they were made, and a moved-back session is home again", () => {
    const s = {
      buildRestDay: 5,
      changes: [
        { id: "b", kind: "move" as const, date: "2026-10-18", toDate: "2026-10-14", recordedAt: at(2) },
        { id: "a", kind: "move" as const, date: "2026-10-14", toDate: "2026-10-18", recordedAt: at(1) },
      ],
    };
    const wed = dayPlan("2026-10-14", s);
    expect(wed.kind).toBe("train");
    if (wed.kind === "train") expect(wed.movedFrom).toBeUndefined();
    expect(key("2026-10-18", s)).toBe("sunday");
  });

  it("moves into the five-day weeks' rest day, and ignores a change whose day has no session", () => {
    const s = {
      buildRestDay: 5,
      changes: [
        { id: "a", kind: "move" as const, date: "2026-09-22", toDate: "2026-09-25", recordedAt: at(1) },
        { id: "b", kind: "skip" as const, date: "2026-09-27", recordedAt: at(2) }, // Sunday: nothing to skip
      ],
    };
    expect(key("2026-09-25", s)).toBe("pull_a");
    expect(key("2026-09-22", s)).toBe("moved");
    expect(key("2026-09-27", s)).toBe("sunday");
  });

  it("keeps ramp-in days optional wherever they land", () => {
    const s = { buildRestDay: 5, changes: [{ id: "a", kind: "move" as const, date: "2026-09-17", toDate: "2026-09-20", recordedAt: at(1) }] };
    const sun = dayPlan("2026-09-20", s);
    expect(sun.kind === "train" && sun.optionalDay).toBe(true);
  });
});
