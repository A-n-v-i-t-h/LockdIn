// Training01, the program of record (D:\Dev\Gym\docs\03-training.md, closed 2026-09-17).
// This file is the machine-readable copy the coach programs from. Change it only
// when the plan changes, and bump PROGRAM_VERSION when you do.

export const PROGRAM_VERSION = "training01.2";
export const PROGRAM_START = "2026-09-07"; // Monday of week 1
export const BASELINE_WEEK_START = "2026-09-21"; // week 3
export const FULL_PROGRAM_START = "2026-10-05"; // week 5
export const ONE_RM_ALLOWED_FROM = "2026-12-01";

/**
 * How the logged number is read:
 * - barbell: total including the Olympic bar
 * - ezbar: total including the (unweighed) EZ/straight bar
 * - smith, plate_machine, sled: plates loaded, machine not counted
 * - dumbbell: weight of one dumbbell
 * - cable, stack: the stack setting
 * - belt: weight added on the dip belt (bodyweight lifts)
 * - plate: the plate held (neck work)
 * - none: reps only
 */
export type Equipment =
  | "barbell"
  | "ezbar"
  | "smith"
  | "dumbbell"
  | "cable"
  | "stack"
  | "plate_machine"
  | "sled"
  | "belt"
  | "plate"
  | "none";

export type LoadMode = "external" | "added" | "none";

export interface ExerciseDef {
  key: string;
  name: string;
  equipment: Equipment;
  /** Lower-body barbell or machine work takes bigger jumps. */
  lower?: boolean;
  stepOverride?: number;
  /** Done one arm or leg at a time; reps are per side. */
  perSide?: boolean;
  station?: string;
  cue: string;
  /** The one swap shown on the card when the station is taken. */
  substitute?: string;
  /** Exercises whose bests roll up together (bench heavy + volume = bench). */
  liftGroup?: string;
  /** Tested in the week-3 baseline (8 reps at about 2 in reserve). */
  baseline?: boolean;
}

export function loadModeOf(ex: ExerciseDef): LoadMode {
  if (ex.equipment === "belt") return "added";
  if (ex.equipment === "none") return "none";
  return "external";
}

export const LOAD_HINT: Record<Equipment, string> = {
  barbell: "total, bar included",
  ezbar: "total, bar included",
  smith: "plates only",
  dumbbell: "per dumbbell",
  cable: "stack setting",
  stack: "stack setting",
  plate_machine: "plates only",
  sled: "plates only",
  belt: "added on the belt",
  plate: "plate held",
  none: "reps only",
};

const ex = (d: ExerciseDef): [string, ExerciseDef] => [d.key, d];

export const EXERCISES: Record<string, ExerciseDef> = Object.fromEntries([
  // ---- Press ----
  ex({
    key: "bench_press",
    name: "Barbell Bench Press",
    equipment: "barbell",
    station: "Flat bench press station",
    cue: "Grip ~1.5× shoulder width, shoulder blades pinned. Touch at the nipple line, 1 s pause on heavy sets, 2 s down.",
    substitute: "smith_bench_press",
    liftGroup: "bench",
    baseline: true,
  }),
  ex({
    key: "incline_db_press",
    name: "Incline Dumbbell Press",
    equipment: "dumbbell",
    station: "Adjustable bench at 30°",
    cue: "Bench at 30°, not 45. Elbows to just below the torso line, stop before the dumbbells clash. 2–3 s down.",
    substitute: "incline_smith_press",
    liftGroup: "incline_db_press",
  }),
  ex({
    key: "ohp",
    name: "Barbell Overhead Press",
    equipment: "barbell",
    station: "Power rack, bar at upper-chest height",
    cue: "Standing and strict, no leg drive. Glutes and abs braced. Lock out with the biceps beside the ears.",
    substitute: "iso_shoulder_press",
    liftGroup: "ohp",
    baseline: true,
  }),
  ex({
    key: "incline_smith_press",
    name: "Incline Smith Press",
    equipment: "smith",
    station: "Smith machine, bench at 30°",
    cue: "Bench at 30°, bar path set to touch the upper chest. Same depth and tempo as the incline dumbbell press.",
    substitute: "incline_db_press",
    liftGroup: "incline_smith_press",
  }),
  // ---- Delts ----
  ex({
    key: "cable_lateral_raise",
    name: "Cable Lateral Raise",
    equipment: "cable",
    perSide: true,
    station: "Cable crossover, low pulley, D-handle",
    cue: "Cable runs behind the body. Lead with the elbow, stop at shoulder height, 2 s down.",
    substitute: "db_lateral_raise",
  }),
  ex({
    key: "db_lateral_raise",
    name: "Dumbbell Lateral Raise",
    equipment: "dumbbell",
    cue: "Slight forward lean, elbows soft, no swing and no shrug. Stop at shoulder height, 2 s down.",
    substitute: "cable_lateral_raise",
  }),
  ex({
    key: "lean_away_lateral",
    name: "DB Lean-away Lateral Raise",
    equipment: "dumbbell",
    perSide: true,
    station: "One hand on the rack",
    cue: "Body angled away, working arm hangs across the midline. Full arc from the crossed-over start.",
    substitute: "btb_cable_lateral",
  }),
  ex({
    key: "iso_shoulder_press",
    name: "Iso-lateral Shoulder Press (machine)",
    equipment: "plate_machine",
    cue: "Seat so the handles start at chin height. Full lockout, controlled lowering.",
  }),
  ex({
    key: "btb_cable_lateral",
    name: "Behind-the-back Cable Lateral Raise",
    equipment: "cable",
    perSide: true,
    cue: "Low pulley, cable behind the back. Lead with the elbow to shoulder height.",
  }),
  // ---- Triceps ----
  ex({
    key: "oh_cable_ext",
    name: "Single-arm Overhead Cable Extension",
    equipment: "cable",
    perSide: true,
    station: "Cable crossover, low pulley",
    cue: "Face away, split stance. Working elbow beside the ear and fixed. Left arm first; the right matches its reps.",
    substitute: "oh_db_ext",
  }),
  ex({
    key: "cable_kickback",
    name: "Cable Triceps Kickback",
    equipment: "cable",
    perSide: true,
    station: "Cable crossover, low pulley",
    cue: "Hinge ~45°. Upper arm pinned parallel to the torso and still. 1 s squeeze, 2 s down. Light and strict.",
    substitute: "db_kickback",
  }),
  ex({
    key: "db_skullcrusher",
    name: "Dumbbell Skullcrusher",
    equipment: "dumbbell",
    station: "Flat bench",
    cue: "One dumbbell per hand, palms facing. Lower beside and behind the head, stop just short of lockout.",
    substitute: "db_kickback",
  }),
  ex({
    key: "cable_pressdown",
    name: "Cable Triceps Pressdown",
    equipment: "cable",
    station: "Cable crossover, high pulley",
    cue: "Elbows pinned at the sides. Full lockout, 2 s down.",
    substitute: "close_grip_pushup",
  }),
  ex({
    key: "oh_db_ext",
    name: "Single-arm DB Overhead Extension",
    equipment: "dumbbell",
    perSide: true,
    cue: "Elbow beside the ear, full stretch behind the head. Left arm first.",
  }),
  ex({
    key: "db_kickback",
    name: "Dumbbell Triceps Kickback",
    equipment: "dumbbell",
    perSide: true,
    cue: "Braced on a bench, upper arm parallel to the torso and still. 1 s squeeze.",
  }),
  ex({
    key: "close_grip_pushup",
    name: "Close-grip Push-up",
    equipment: "none",
    cue: "Hands under the shoulders, elbows brushing the ribs. Full lockout.",
  }),
  // ---- Pull ----
  ex({
    key: "pullup",
    name: "Pull-up",
    equipment: "belt",
    station: "Pull-up bar, dip belt",
    cue: "Pronated, ~1.3× shoulder width (forearms vertical at the top). Dead hang every rep, chin clears the bar, 2 s down.",
    substitute: "lat_pulldown",
    liftGroup: "pullup",
    baseline: true,
  }),
  ex({
    key: "cs_row",
    name: "Chest-Supported Row (plate-loaded)",
    equipment: "plate_machine",
    station: "Plate-loaded chest-supported row",
    cue: "Chest pinned to the pad, neutral grip. Pull to the lower ribs, elbows ~45°, 1 s squeeze, full stretch at the bottom.",
    substitute: "cs_tbar_row",
  }),
  ex({
    key: "reverse_pec_deck",
    name: "Reverse Pec Deck",
    equipment: "stack",
    station: "Pec deck, handles at shoulder height",
    cue: "Thumbs up, loose grip, push through the pinky side. Stop at the torso line, 2 s back.",
    substitute: "cable_rev_fly",
  }),
  ex({
    key: "seated_cable_row",
    name: "Seated Cable Row (V-handle)",
    equipment: "stack",
    station: "Seated row, close neutral grip",
    cue: "Torso vertical, sway under 10°. Pull to the navel; let the shoulder blades protract fully at the front. 2 s back.",
    substitute: "iso_row",
  }),
  ex({
    key: "face_pull",
    name: "Face Pull",
    equipment: "cable",
    station: "Cable crossover, rope at eye height",
    cue: "Pull to the forehead, elbows above the wrists, finish with external rotation. No lean.",
    substitute: "band_face_pull",
  }),
  ex({
    key: "lat_pulldown",
    name: "Lat Pulldown",
    equipment: "stack",
    cue: "Pronated, same index-finger width as the pull-up. Thighs pinned, full stretch at the top.",
  }),
  ex({
    key: "cs_tbar_row",
    name: "CS T-bar Row",
    equipment: "plate_machine",
    cue: "Close neutral handle, chest on the pad. Pull to the lower ribs.",
  }),
  ex({
    key: "cable_rev_fly",
    name: "Cable Reverse Fly",
    equipment: "cable",
    cue: "Pulleys at shoulder height, cables crossed. Stop at the torso line.",
  }),
  ex({
    key: "iso_row",
    name: "Iso-lateral Row (machine)",
    equipment: "plate_machine",
    cue: "Neutral grip, chest on the pad, full protraction at the front.",
  }),
  ex({
    key: "band_face_pull",
    name: "Band Face Pull",
    equipment: "none",
    cue: "Band at eye height. Pull to the forehead with external rotation.",
  }),
  // ---- Biceps and forearms ----
  ex({
    key: "incline_db_curl",
    name: "Incline Dumbbell Curl",
    equipment: "dumbbell",
    station: "Bench at 45°",
    cue: "Shoulders back on the pad, arms hanging behind the torso. Fully supinated; 2–3 s down to full extension.",
    substitute: "bayesian_curl",
  }),
  ex({
    key: "preacher_curl",
    name: "Preacher Curl (EZ bar)",
    equipment: "ezbar",
    station: "Preacher bench",
    cue: "Armpits snug to the pad. Full extension without the elbows lifting; 2–3 s down, no bounce.",
    substitute: "db_preacher_curl",
  }),
  ex({
    key: "wrist_curl",
    name: "Wrist Curl",
    equipment: "ezbar",
    cue: "Forearms flat on the thighs, wrists past the knees. Let the bar roll to the fingertips, then curl fully.",
    substitute: "db_wrist_curl",
  }),
  ex({
    key: "reverse_wrist_curl",
    name: "Reverse Wrist Curl",
    equipment: "ezbar",
    cue: "Same seat, palms down, lighter. Full flexion to full extension, slowly. Straight after the wrist curl.",
    substitute: "db_reverse_wrist_curl",
  }),
  ex({
    key: "face_away_curl",
    name: "Face-away Cable Curl",
    equipment: "cable",
    perSide: true,
    station: "Cable crossover, low pulley",
    cue: "Face away, arm hanging behind the torso. Curl without the elbow drifting forward. Left first, 2 s down.",
    substitute: "incline_db_curl",
  }),
  ex({
    key: "hammer_curl",
    name: "Hammer Curl",
    equipment: "dumbbell",
    cue: "Neutral grip, elbows pinned at the sides, standing. No swing, 2 s down.",
    substitute: "cross_body_hammer",
  }),
  ex({
    key: "spider_curl",
    name: "Dumbbell Spider Curl",
    equipment: "dumbbell",
    station: "Adjustable bench at ~45°, chest down",
    cue: "Arms hang straight down in front of the bench. Upper arms stay vertical; squeeze at the top, 2 s down.",
    substitute: "db_preacher_curl",
  }),
  ex({
    key: "bayesian_curl",
    name: "Bayesian Cable Curl",
    equipment: "cable",
    perSide: true,
    cue: "Face away from a low pulley, arm behind the torso. Same long-head stretch as the incline curl.",
  }),
  ex({
    key: "db_preacher_curl",
    name: "Single-arm DB Preacher Curl",
    equipment: "dumbbell",
    perSide: true,
    cue: "Armpit to the pad, full extension without the elbow lifting.",
  }),
  ex({
    key: "db_wrist_curl",
    name: "DB Wrist Curl",
    equipment: "dumbbell",
    perSide: true,
    cue: "Forearm on a flat bench, one side at a time.",
  }),
  ex({
    key: "db_reverse_wrist_curl",
    name: "DB Reverse Wrist Curl",
    equipment: "dumbbell",
    perSide: true,
    cue: "Forearm on a flat bench, palm down, slow.",
  }),
  ex({
    key: "cross_body_hammer",
    name: "Cross-body Hammer Curl",
    equipment: "dumbbell",
    cue: "Neutral grip, curl across the body toward the opposite shoulder.",
  }),
  // ---- Legs ----
  ex({
    key: "back_squat",
    name: "Barbell Back Squat",
    equipment: "barbell",
    lower: true,
    station: "Power rack, safeties just below the bottom",
    cue: "High-bar, free bar. Shoulder-width stance, toes out ~20°. Below parallel, controlled, no bounce.",
    substitute: "hack_squat",
    liftGroup: "squat",
    baseline: true,
  }),
  ex({
    key: "leg_press",
    name: "Leg Press (45° sled)",
    equipment: "sled",
    stepOverride: 10,
    station: "45° sled",
    cue: "Feet mid-platform, shoulder width. Knees toward the chest until just before the pelvis tucks. Don't lock out.",
    substitute: "hack_squat",
  }),
  ex({
    key: "standing_leg_curl",
    name: "Standing Leg Curl (single-leg)",
    equipment: "plate_machine",
    perSide: true,
    station: "Plate-loaded standing leg curl",
    cue: "Lean the torso as far forward over the pad as it allows. Weaker leg first. 1 s squeeze, 2 s down, no hip hike.",
    substitute: "sliding_leg_curl",
  }),
  ex({
    key: "leg_extension",
    name: "Leg Extension (plate-loaded)",
    equipment: "plate_machine",
    station: "Plate-loaded leg extension",
    cue: "Back against the pad, pad above the ankle. Full extension, 1 s hold at the top.",
    substitute: "sissy_squat",
  }),
  ex({
    key: "rdl",
    name: "Romanian Deadlift",
    equipment: "barbell",
    lower: true,
    cue: "Soft knees, hips travel back, bar tracks the thighs. Stop at about mid-shin, 3 s down.",
    substitute: "db_rdl",
    liftGroup: "rdl",
    baseline: true,
  }),
  ex({
    key: "deadlift",
    name: "Conventional Deadlift",
    equipment: "barbell",
    lower: true,
    station: "Platform",
    cue: "Bar over midfoot, hip-width stance, brace first. Dead stop and a full reset on every rep.",
    substitute: "trap_bar_deadlift",
    liftGroup: "deadlift",
  }),
  ex({
    key: "lp_calf_raise",
    name: "Leg-Press Calf Raise",
    equipment: "sled",
    stepOverride: 5,
    station: "45° sled, safety catches engaged",
    cue: "Balls of the feet on the lower edge, knees straight but not locked. Full stretch and a 1 s pause at the bottom.",
    substitute: "smith_calf_raise",
  }),
  ex({
    key: "hack_squat",
    name: "Hack Squat",
    equipment: "plate_machine",
    lower: true,
    cue: "Feet mid-platform, full depth, no bounce.",
  }),
  ex({
    key: "sliding_leg_curl",
    name: "Sliding Leg Curl (towel)",
    equipment: "none",
    cue: "Heels on a towel, hips up, curl the heels in and slide out slowly.",
  }),
  ex({
    key: "sissy_squat",
    name: "Assisted Sissy Squat",
    equipment: "none",
    cue: "Hold a rack, knees travel forward, hips stay extended.",
  }),
  ex({
    key: "db_rdl",
    name: "Dumbbell Romanian Deadlift",
    equipment: "dumbbell",
    cue: "Same hinge and depth as the barbell RDL, 3 s down.",
  }),
  ex({
    key: "trap_bar_deadlift",
    name: "Trap-bar Deadlift",
    equipment: "ezbar",
    lower: true,
    cue: "Stand centred, brace, push the floor away. Full reset each rep.",
  }),
  ex({
    key: "smith_calf_raise",
    name: "Smith Standing Calf Raise",
    equipment: "smith",
    cue: "Balls of the feet on a plate, knees straight, 1 s pause at the bottom.",
  }),
  ex({
    key: "smith_bench_press",
    name: "Smith Bench Press",
    equipment: "smith",
    cue: "Same grip and touch point as the barbell bench. Log it as its own lift.",
  }),
  // ---- Trunk and neck ----
  ex({
    key: "cable_crunch",
    name: "Cable Crunch",
    equipment: "cable",
    station: "Cable crossover, rope at the high pulley",
    cue: "Kneeling, hips fixed. Spinal flexion only, 2 s back up.",
    substitute: "ab_wheel",
  }),
  ex({
    key: "hanging_leg_raise",
    name: "Hanging Leg Raise",
    equipment: "none",
    station: "Pull-up bar",
    cue: "Straight-arm hang, no swing. Tilt the pelvis at the top. Bent knees until strict.",
    substitute: "lying_leg_raise",
  }),
  ex({
    key: "neck",
    name: "Neck Curl + Extension",
    equipment: "plate",
    station: "Flat bench, plate over a folded towel",
    cue: "Curl face up, extension face down, head off the end. Slow both ways, never explosive.",
    substitute: "manual_neck",
  }),
  ex({
    key: "ab_wheel",
    name: "Ab Wheel Rollout",
    equipment: "none",
    cue: "From the knees, ribs down, roll out only as far as the lower back stays neutral.",
  }),
  ex({
    key: "lying_leg_raise",
    name: "Lying Leg Raise (flat bench)",
    equipment: "none",
    cue: "Hands behind the head on the bench, lower back pressed down.",
  }),
  ex({
    key: "manual_neck",
    name: "Manual-resistance Neck Work",
    equipment: "none",
    cue: "Hand on the forehead, then the back of the head. Slow, steady pressure.",
  }),
]);

export type SessionKey = "push_a" | "pull_a" | "legs_q" | "push_b" | "pull_b" | "legs_p";

export interface SlotDef {
  /** Position on the card: "1", "6a". */
  slot: string;
  exercise: string;
  /** Progression track. Same track on two days = one progression. */
  track: string;
  label?: string;
  sets: number;
  reps: [number, number];
  rir: string;
  rest: string;
  /** Sets are prescribed as a percentage of the current estimated max (speed bench). */
  percentOfMax?: number;
  supersetWith?: string;
  optional?: boolean;
  /** Only from this date (deadlift). */
  from?: string;
  /** Different set count before a date (RDL keeps 4 sets until the deadlift enters). */
  setsBefore?: { date: string; sets: number };
  /** Dropped from this date on. The slot stays here so past days still replay exactly. */
  until?: string;
  /** Different rep range before a date. */
  repsBefore?: { date: string; reps: [number, number] };
  /** Warm-up sets prescribed from a date (they are guidance, never progression volume). */
  warmups?: { from: string; sets: number };
  note?: string;
}

export interface SessionDef {
  key: SessionKey;
  weekday: number;
  name: string;
  focus: string;
  minutes: number;
  cardio?: string;
  slots: SlotDef[];
}

export const SESSIONS: SessionDef[] = [
  {
    key: "push_a",
    weekday: 1,
    name: "Push A",
    focus: "Heavy bench",
    minutes: 70,
    slots: [
      { slot: "1", exercise: "bench_press", track: "bench_heavy", sets: 3, setsBefore: { date: "2026-09-22", sets: 4 }, warmups: { from: "2026-09-22", sets: 1 }, reps: [4, 6], rir: "1", rest: "2–3 min" },
      { slot: "2", exercise: "incline_db_press", track: "incline_db_press", sets: 3, warmups: { from: "2026-09-22", sets: 1 }, reps: [8, 10], rir: "2", rest: "2 min" },
      { slot: "3", exercise: "ohp", track: "ohp", sets: 3, reps: [6, 8], rir: "2", rest: "2–3 min" },
      { slot: "4", exercise: "cable_lateral_raise", track: "cable_lateral_raise", sets: 3, setsBefore: { date: "2026-09-22", sets: 4 }, reps: [12, 15], rir: "1", rest: "90 s" },
      { slot: "5", exercise: "oh_cable_ext", track: "oh_cable_ext", sets: 3, setsBefore: { date: "2026-09-22", sets: 4 }, reps: [10, 12], rir: "2", rest: "90 s", note: "Each arm; rest after both" },
      { slot: "6", exercise: "cable_kickback", track: "cable_kickback", sets: 3, reps: [12, 15], rir: "1", rest: "60 s" },
      { slot: "7", exercise: "cable_crunch", track: "cable_crunch", sets: 3, reps: [12, 15], rir: "2", rest: "60 s" },
    ],
  },
  {
    key: "pull_a",
    weekday: 2,
    name: "Pull A",
    focus: "Heavy pull-ups",
    minutes: 62,
    cardio: "20 min easy (capped)",
    slots: [
      { slot: "1", exercise: "pullup", track: "pullup_weighted", label: "Weighted Pull-up", sets: 3, setsBefore: { date: "2026-09-22", sets: 4 }, reps: [4, 8], repsBefore: { date: "2026-09-22", reps: [4, 6] }, rir: "1–2", rest: "3 min" },
      { slot: "2", exercise: "cs_row", track: "cs_row", sets: 3, setsBefore: { date: "2026-09-22", sets: 4 }, warmups: { from: "2026-09-22", sets: 1 }, reps: [8, 10], rir: "2", rest: "2 min" },
      { slot: "3", exercise: "reverse_pec_deck", track: "reverse_pec_deck", sets: 3, reps: [12, 15], rir: "1", rest: "90 s" },
      { slot: "4", exercise: "incline_db_curl", track: "incline_db_curl", sets: 3, setsBefore: { date: "2026-09-22", sets: 4 }, reps: [8, 12], rir: "2", rest: "90 s" },
      { slot: "5", exercise: "preacher_curl", track: "preacher_curl", sets: 3, reps: [8, 12], rir: "2", rest: "90 s" },
      { slot: "6a", exercise: "wrist_curl", track: "wrist_curl", sets: 3, reps: [12, 15], rir: "1", rest: "—", supersetWith: "6b" },
      { slot: "6b", exercise: "reverse_wrist_curl", track: "reverse_wrist_curl", sets: 3, reps: [15, 20], rir: "1", rest: "60 s", supersetWith: "6a", note: "Rest after the pair" },
    ],
  },
  {
    key: "legs_q",
    weekday: 3,
    name: "Legs Q",
    focus: "Quads",
    minutes: 55,
    slots: [
      { slot: "1", exercise: "bench_press", track: "bench_speed", label: "Bench Press — speed", sets: 5, reps: [3, 3], rir: "—", rest: "90 s", percentOfMax: 0.6, until: "2026-09-22", note: "Dropped from 22 Sep: he cut the third bench session to shorten Wednesday." },
      { slot: "2", exercise: "back_squat", track: "back_squat", sets: 3, setsBefore: { date: "2026-09-22", sets: 4 }, warmups: { from: "2026-09-22", sets: 1 }, reps: [6, 8], rir: "2", rest: "3 min" },
      { slot: "3", exercise: "leg_press", track: "leg_press", sets: 3, warmups: { from: "2026-09-22", sets: 1 }, reps: [10, 12], rir: "2", rest: "2 min" },
      { slot: "4", exercise: "standing_leg_curl", track: "standing_leg_curl", sets: 3, reps: [10, 12], rir: "2", rest: "90 s", note: "Each leg; rest after both" },
      { slot: "5", exercise: "db_lateral_raise", track: "db_lateral_raise", sets: 3, setsBefore: { date: "2026-09-22", sets: 4 }, reps: [12, 15], rir: "1", rest: "90 s" },
      { slot: "6", exercise: "neck", track: "neck", sets: 3, reps: [15, 20], rir: "2", rest: "60 s", optional: true },
    ],
  },
  {
    key: "push_b",
    weekday: 4,
    name: "Push B",
    focus: "Volume bench",
    minutes: 60,
    slots: [
      { slot: "1", exercise: "bench_press", track: "bench_volume", sets: 3, setsBefore: { date: "2026-09-22", sets: 4 }, warmups: { from: "2026-09-22", sets: 1 }, reps: [8, 10], rir: "2", rest: "2–3 min" },
      { slot: "2", exercise: "incline_smith_press", track: "incline_smith_press", sets: 3, warmups: { from: "2026-09-22", sets: 1 }, reps: [8, 12], rir: "2", rest: "2 min" },
      { slot: "3", exercise: "cable_lateral_raise", track: "cable_lateral_raise", sets: 3, setsBefore: { date: "2026-09-22", sets: 4 }, reps: [12, 15], rir: "1", rest: "90 s" },
      { slot: "4", exercise: "db_skullcrusher", track: "db_skullcrusher", sets: 3, setsBefore: { date: "2026-09-22", sets: 4 }, reps: [10, 12], rir: "2", rest: "90 s" },
      { slot: "5", exercise: "cable_pressdown", track: "cable_pressdown", sets: 3, reps: [12, 15], rir: "1", rest: "90 s" },
      { slot: "6", exercise: "hanging_leg_raise", track: "hanging_leg_raise", sets: 3, reps: [10, 15], rir: "2", rest: "60 s" },
    ],
  },
  {
    key: "pull_b",
    weekday: 5,
    name: "Pull B",
    focus: "Pull volume",
    minutes: 60,
    cardio: "20–30 min easy",
    slots: [
      { slot: "1", exercise: "pullup", track: "pullup_bw", label: "Pull-up (BW or light)", sets: 3, setsBefore: { date: "2026-09-22", sets: 4 }, reps: [8, 12], rir: "2", rest: "2–3 min", note: "Same grip and width as Tuesday" },
      { slot: "2", exercise: "seated_cable_row", track: "seated_cable_row", sets: 3, setsBefore: { date: "2026-09-22", sets: 4 }, warmups: { from: "2026-09-22", sets: 1 }, reps: [10, 12], rir: "2", rest: "2 min" },
      { slot: "3", exercise: "face_pull", track: "face_pull", sets: 3, reps: [15, 20], rir: "1", rest: "60 s" },
      { slot: "4", exercise: "face_away_curl", track: "face_away_curl", sets: 3, reps: [10, 12], rir: "2", rest: "90 s" },
      { slot: "5", exercise: "hammer_curl", track: "hammer_curl", sets: 3, setsBefore: { date: "2026-09-22", sets: 4 }, reps: [10, 12], rir: "2", rest: "90 s" },
      { slot: "6", exercise: "spider_curl", track: "spider_curl", sets: 3, reps: [10, 12], rir: "2", rest: "90 s" },
    ],
  },
  {
    key: "legs_p",
    weekday: 6,
    name: "Legs P",
    focus: "Posterior + delts",
    minutes: 68,
    slots: [
      { slot: "1", exercise: "deadlift", track: "deadlift", sets: 3, reps: [5, 5], rir: "2–3", rest: "3 min", from: FULL_PROGRAM_START, note: "Technique first: dead stop every rep" },
      { slot: "2", exercise: "rdl", track: "rdl", sets: 3, reps: [8, 10], rir: "2", rest: "2–3 min", setsBefore: { date: FULL_PROGRAM_START, sets: 4 } },
      { slot: "3", exercise: "standing_leg_curl", track: "standing_leg_curl", sets: 3, reps: [10, 12], rir: "1", rest: "90 s", note: "Each leg; rest after both" },
      { slot: "4", exercise: "leg_extension", track: "leg_extension", sets: 3, reps: [8, 12], repsBefore: { date: "2026-09-22", reps: [12, 15] }, rir: "1", rest: "90 s" },
      { slot: "5", exercise: "lean_away_lateral", track: "lean_away_lateral", sets: 3, setsBefore: { date: "2026-09-22", sets: 4 }, reps: [12, 15], rir: "1", rest: "90 s" },
      { slot: "6", exercise: "neck", track: "neck", sets: 3, reps: [15, 20], rir: "2", rest: "60 s" },
      { slot: "7", exercise: "lp_calf_raise", track: "lp_calf_raise", sets: 3, reps: [12, 15], rir: "1", rest: "60 s", optional: true },
    ],
  },
];

export const SESSION_BY_KEY: Record<SessionKey, SessionDef> = Object.fromEntries(
  SESSIONS.map((s) => [s.key, s]),
) as Record<SessionKey, SessionDef>;

export const REST_DAY = {
  name: "Rest",
  focus: "30–40 min walk outside",
};

/** Dec 2025 peaks, estimated maxes (Epley). Bests below these are regain, not PRs. */
export const PEAKS: Record<string, { e1rm: number; label: string }> = {
  bench: { e1rm: 73, label: "60 kg × 6–7 in Dec 2025" },
  pullup: { e1rm: 86, label: "BW+10 kg × 4–5 at ~64 kg in Dec 2025 (total load)" },
};

export const BENCH_GOAL_KG = 100;

export function exercise(key: string): ExerciseDef {
  const d = EXERCISES[key];
  if (!d) throw new Error(`Unknown exercise: ${key}`);
  return d;
}

export function isKnownExercise(key: string): boolean {
  return key in EXERCISES;
}

/** Every track and the slot that defines its scheme. The first occurrence wins. */
export const TRACKS: Record<string, { slot: SlotDef; session: SessionKey }> = (() => {
  const out: Record<string, { slot: SlotDef; session: SessionKey }> = {};
  for (const s of SESSIONS) for (const sl of s.slots) if (!out[sl.track]) out[sl.track] = { slot: sl, session: s.key };
  return out;
})();

/** Track used when a substitute replaces a slot: its own progression, same scheme. */
export function substituteTrack(exerciseKey: string, mainTrack: string): string {
  return `sub:${mainTrack}:${exerciseKey}`;
}

export function parseSubstituteTrack(track: string): { mainTrack: string; exercise: string } | null {
  const m = /^sub:([a-z0-9_]+):([a-z0-9_]+)$/.exec(track);
  return m ? { mainTrack: m[1], exercise: m[2] } : null;
}

/** The slot scheme a track follows (substitute tracks borrow the main slot's). */
export function schemeForTrack(track: string): SlotDef | null {
  const sub = parseSubstituteTrack(track);
  if (sub) return TRACKS[sub.mainTrack]?.slot ?? null;
  return TRACKS[track]?.slot ?? null;
}

/** Numeric RIR target for load estimates: "1–2" → 1.5, "—" → 2. */
export function rirValue(rir: string): number {
  const nums = rir.match(/\d+(\.\d+)?/g)?.map(Number) ?? [];
  if (nums.length === 0) return 2;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/** "2–3 min" → 150, "90 s" → 90, "—" → 0. */
export function restSeconds(rest: string): number {
  const nums = rest.match(/\d+(\.\d+)?/g)?.map(Number) ?? [];
  if (nums.length === 0) return 0;
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
  return Math.round(/min/.test(rest) ? avg * 60 : avg);
}
