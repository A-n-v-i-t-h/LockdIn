"use client";

import Link from "next/link";
import { useState } from "react";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Opens an earlier day (last 30 days) to log a session, a weigh-in or the food totals. */
export function PastDayPicker({ min, max }: { min: string; max: string }) {
  const [date, setDate] = useState(max);
  const ok = ISO_DATE.test(date) && date >= min && date <= max;
  return (
    <section className="card" aria-label="Log a past day">
      <label className="field">
        <span>Day</span>
        <input className="input" type="date" value={date} min={min} max={max} onChange={(e) => setDate(e.target.value)} />
      </label>
      {ok ? (
        <div className="wrap">
          <Link className="btn ghost small" href={`/train/history/${date}`}>
            Session
          </Link>
          <Link className="btn ghost small" href={`/checkin?date=${date}`}>
            Weigh-in
          </Link>
          <Link className="btn ghost small" href={`/tonight?date=${date}`}>
            Food totals
          </Link>
        </div>
      ) : (
        <p className="sm t3">Pick a day in the last 30 days.</p>
      )}
    </section>
  );
}
