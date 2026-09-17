import { describe, expect, it } from "vitest";
import { dayPlan, isRampIn, nextDateForTrack, phaseOf, slotSets, weekNumber } from "@/lib/fitness/schedule";
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
  it("matches the plan's weekly set counts", () => {
    const direct = (keys: string[]) =>
      SESSIONS.flatMap((s) => s.slots)
        .filter((sl) => keys.includes(sl.exercise) && !sl.optional)
        .reduce((a, sl) => a + sl.sets, 0);
    expect(direct(["cable_lateral_raise", "db_lateral_raise", "lean_away_lateral"])).toBe(16);
    expect(direct(["incline_db_curl", "preacher_curl", "face_away_curl", "hammer_curl", "spider_curl"])).toBe(17);
    expect(direct(["oh_cable_ext", "cable_kickback", "db_skullcrusher", "cable_pressdown"])).toBe(14);
    expect(direct(["neck"])).toBe(6);
    expect(direct(["wrist_curl", "reverse_wrist_curl"])).toBe(6);
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
