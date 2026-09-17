// What D:\Dev\Gym\LOG.md holds as of 2026-09-17. Only logged rows are imported:
// the ~59.5 kg reading from 17 Sep is not in the log (its conditions weren't
// confirmed), so it isn't here either.
import type { Queryable } from "../src/lib/db";
import { saveMeasurement, saveWeighIn } from "../src/lib/fitness/repo";
import { insertTargets } from "../src/lib/fitness/repo";

export const GYM_LOG = {
  weighIns: [{ date: "2026-09-07", weight: 57.7 }],
  // Month 0 was taken solo with an inch tape. Most values were logged as ranges
  // (measurement uncertainty); only the single values are imported, because
  // missing data is shown as missing, never inferred. The ranges stay in LOG.md
  // until the assisted re-measure replaces them.
  monthly: {
    date: "2026-09-07",
    values: { arm_l: 30.5, hips: 91.4 } as Record<string, number>,
  },
  targets: { effectiveDate: "2026-09-07", kcal: 2650, protein: 120, carbs: 385, fat: 70 },
};

export async function seedFromGymLog(q: Queryable, userId: string): Promise<string[]> {
  const done: string[] = [];
  const at = "2026-09-07T03:00:00.000Z";
  for (const w of GYM_LOG.weighIns) {
    await saveWeighIn(q, userId, { date: w.date, weight: w.weight, protocolOk: true, bedAt: null, wakeAt: null, note: "From LOG.md" }, at);
  }
  done.push(`${GYM_LOG.weighIns.length} weigh-in`);
  const entries = Object.entries(GYM_LOG.monthly.values);
  for (const [kind, cm] of entries) {
    await saveMeasurement(
      q,
      userId,
      { date: GYM_LOG.monthly.date, kind: kind as never, valueCm: cm, note: "Month 0, solo tape (provisional)" },
      at,
    );
  }
  done.push(`${entries.length} single-value month-0 measurements (ranged ones left in LOG.md)`);
  const t = GYM_LOG.targets;
  await insertTargets(q, userId, { ...t, source: "plan", reason: "Phase 1 plan (02-nutrition.md)" }, at);
  done.push("Phase 1 targets 2650 / 120 / 385 / 70");
  return done;
}
