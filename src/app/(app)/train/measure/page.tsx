import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { loadMeasurements } from "@/lib/fitness/repo";
import { listPhotos } from "@/lib/fitness/photos";
import { deletePhotoAction } from "@/app/actions/fitness";
import { fmtShort, localDate, now } from "@/lib/time";
import { plural } from "@/lib/format";
import { Header } from "@/components/Header";
import { ScrollX } from "@/components/ScrollX";
import { TrainNav } from "@/components/TrainNav";
import { MeasureForm } from "./MeasureForm";

export const metadata: Metadata = { title: "Measure" };
export const dynamic = "force-dynamic";

const KINDS: { key: string; label: string; how: string }[] = [
  { key: "waist", label: "Waist", how: "At the navel, relaxed exhale. Weekly on Mondays too." },
  { key: "arm_r", label: "Arm R", how: "Cold, flexed, before training." },
  { key: "arm_l", label: "Arm L", how: "Cold, flexed, before training." },
  { key: "chest", label: "Chest", how: "Nipple line, arms down, relaxed exhale." },
  { key: "thigh", label: "Thigh", how: "Mid-thigh, same distance above the kneecap every time." },
  { key: "hips", label: "Hips", how: "Widest point." },
  { key: "bideltoid", label: "Bideltoid", how: "Around both shoulders at the widest point." },
  { key: "neck", label: "Neck", how: "Below the Adam's apple." },
];

export default async function MeasurePage() {
  const user = await requireUser();
  const db = await getDb();
  const today = localDate(now());
  const [measurements, photos] = await Promise.all([loadMeasurements(db, user.id), listPhotos(db, user.id)]);
  const dates = [...new Set(measurements.map((m) => m.date))].sort().reverse();
  const latest = new Map<string, { date: string; cm: number }>();
  for (const m of measurements) latest.set(m.kind, { date: m.date, cm: m.valueCm });
  const photoDates = [...new Set(photos.map((p) => p.date))];

  return (
    <main id="main" className="scr">
      <Header chip="Monthly" />
      <TrainNav current="/train/measure" />
      <div className="hd">
        <div className="eyebrow">Tape and photos · same technique every month</div>
        <h1 className="h1">Measure</h1>
        <p className="sub">Measured in cm. Morning, before training, same spot and light for photos.</p>
      </div>

      <MeasureForm today={today} kinds={KINDS} latest={Object.fromEntries(latest)} />

      <div className="sec">
        Tape history <span>{plural(dates.length, "day")}</span>
      </div>
      <section className="card">
        {dates.length ? (
          <ScrollX label="Tape history">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Day</th>
                  {KINDS.map((k) => (
                    <th key={k.key} className="n">
                      {k.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dates.map((d) => (
                  <tr key={d}>
                    <td className="nowrap">{fmtShort(d)}</td>
                    {KINDS.map((k) => {
                      const m = measurements.find((x) => x.date === d && x.kind === k.key);
                      return (
                        <td key={k.key} className="n">
                          {m ? m.valueCm.toFixed(1) : "·"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollX>
        ) : (
          <p className="sm t3">No measurements yet.</p>
        )}
      </section>

      <div className="sec">
        Photos <span>{plural(photoDates.length, "day")}</span>
      </div>
      {photoDates.length ? (
        photoDates.map((d) => (
          <section key={d} className="card" aria-label={`Photos from ${fmtShort(d)}`}>
            <span className="lbl">{fmtShort(d)}</span>
            <div className="photo-grid">
              {(["front", "side", "back"] as const).map((kind) => {
                const p = photos.find((x) => x.date === d && x.kind === kind);
                return (
                  <figure key={kind}>
                    {p ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/photos/${p.id}`} alt={`${kind} photo, ${fmtShort(d)}`} loading="lazy" />
                    ) : (
                      <div className="empty" style={{ aspectRatio: "3 / 4", display: "grid", placeItems: "center", padding: 4 }}>
                        —
                      </div>
                    )}
                    <figcaption className="row sm t3">
                      <span>{kind}</span>
                      {p ? (
                        <form action={deletePhotoAction}>
                          <input type="hidden" name="id" value={p.id} />
                          <button type="submit" className="swap" aria-label={`Delete ${kind} photo from ${fmtShort(d)}`}>
                            Delete
                          </button>
                        </form>
                      ) : null}
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          </section>
        ))
      ) : (
        <p className="sm t3">No photos yet. They stay private to your account.</p>
      )}
    </main>
  );
}
