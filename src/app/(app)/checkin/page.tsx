import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { loadMeasurements, loadWeighIns } from "@/lib/fitness/repo";
import { usualSleepTimes } from "@/lib/fitness/checkin";
import { sevenDayAverage } from "@/lib/fitness/nutrition";
import { addDays, fmtShort, localDate, localTime, now, weekday } from "@/lib/time";
import { Icon } from "@/components/Icon";
import { CheckinForm } from "./CheckinForm";

export const metadata: Metadata = { title: "Morning check-in" };
export const dynamic = "force-dynamic";

export default async function CheckinPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const user = await requireUser();
  const db = await getDb();
  const today = localDate(now());
  const { date: asked } = await searchParams;
  const date = asked && asked <= today && asked >= addDays(today, -30) ? asked : today;
  const [weighIns, measurements] = await Promise.all([loadWeighIns(db, user.id), loadMeasurements(db, user.id)]);
  const existing = weighIns.find((w) => w.date === date) ?? null;
  const usual = usualSleepTimes(weighIns, date);
  const yesterday = weighIns.filter((w) => w.date < date && w.weight !== null).at(-1) ?? null;
  const avgBefore = sevenDayAverage(weighIns.filter((w) => w.date < date), addDays(date, -1));
  const waist = measurements.find((m) => m.kind === "waist" && m.date === date) ?? null;
  const lastWaist = measurements.filter((m) => m.kind === "waist" && m.date < date).at(-1) ?? null;

  return (
    <main id="main" className="scr">
      <div className="row" style={{ paddingTop: 14 }}>
        <Link href="/" className="iconbtn" aria-label="Close">
          <Icon name="close" size={18} stroke={2} />
        </Link>
        <span className="lbl">Morning check-in</span>
        <span style={{ width: 40 }} />
      </div>
      <div className="hazard" aria-hidden="true" />
      <CheckinForm
        date={date}
        today={today}
        dateLabel={fmtShort(date)}
        mondayWaist={weekday(date) === 1}
        initial={{
          weight: existing?.weight ?? null,
          protocolOk: existing?.protocolOk ?? true,
          bed: existing?.bedAt ? localTime(new Date(existing.bedAt)) : usual.bed,
          wake: existing?.wakeAt ? localTime(new Date(existing.wakeAt)) : usual.wake,
          waist: waist?.valueCm ?? null,
        }}
        sleepFromHistory={!existing && usual.fromHistory}
        previous={yesterday ? { date: fmtShort(yesterday.date), weight: yesterday.weight! } : null}
        previousAvg={avgBefore.avg}
        lastWaist={lastWaist ? { date: fmtShort(lastWaist.date), cm: lastWaist.valueCm } : null}
        editing={!!existing}
      />
    </main>
  );
}
