"use client";

import { useState } from "react";
import { plural } from "@/lib/format";

const DOW = ["S", "M", "T", "W", "T", "F", "S"];

/** Last seven days of calories against the target. Missing days stay empty. */
export function KcalChart({ days }: { days: { date: string; kcal: number | null; target: number }[] }) {
  const [hot, setHot] = useState<number | null>(null);
  const w = 320;
  const h = 160;
  const l = 34;
  const r = 10;
  const t = 18;
  const b = 22;
  const max = Math.max(3000, ...days.map((d) => d.kcal ?? 0), ...days.map((d) => d.target)) * 1.05;
  const top = Math.ceil(max / 1000) * 1000;
  const slot = (w - l - r) / days.length;
  const bw = Math.min(24, slot * 0.56);
  const y = (v: number) => t + ((top - v) * (h - t - b)) / top;
  const logged = days.filter((d) => d.kcal !== null);
  const avg = logged.length ? Math.round(logged.reduce((a, d) => a + (d.kcal ?? 0), 0) / logged.length) : null;
  const target = days.at(-1)?.target ?? 0;
  const label = `Calories for the last ${days.length} days against a ${target.toLocaleString("en-US")} target. ${plural(logged.length, "day")} logged${avg !== null ? `, average ${avg.toLocaleString("en-US")}` : ""}.`;

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
        {Array.from({ length: top / 1000 + 1 }, (_, i) => i * 1000).map((v) => (
          <g key={v}>
            <line className="gl" x1={l} x2={w - r} y1={y(v)} y2={y(v)} />
            <text className="ax" x={l - 6} y={y(v) + 3} textAnchor="end">
              {v ? `${v / 1000}k` : "0"}
            </text>
          </g>
        ))}
        {days.map((d, i) => {
          const cx = l + slot * i + slot / 2;
          const wd = new Date(`${d.date}T00:00:00Z`).getUTCDay();
          return (
            <g key={d.date}>
              {d.kcal !== null ? (
                <rect className={`bar${hot === i ? " hot" : ""}`} x={cx - bw / 2} y={y(d.kcal)} width={bw} height={Math.max(1, y(0) - y(d.kcal))} />
              ) : (
                <rect x={cx - bw / 2} y={y(0) - 2} width={bw} height={2} fill="var(--line)" />
              )}
              <text className="ax" x={cx} y={h - 6} textAnchor="middle">
                {DOW[wd]}
              </text>
              <rect
                className="hit"
                x={l + slot * i}
                y={t}
                width={slot}
                height={h - t - b}
                onPointerEnter={() => setHot(i)}
                onPointerDown={() => setHot(i)}
                onPointerLeave={() => setHot(null)}
              >
                <title>{`${d.date}: ${d.kcal === null ? "not logged" : `${d.kcal.toLocaleString("en-US")} kcal`}`}</title>
              </rect>
            </g>
          );
        })}
        <line className="tgt" x1={l} x2={w - r} y1={y(target)} y2={y(target)} />
        <text className="ax" x={w - r} y={y(target) - 5} textAnchor="end">
          Target {target.toLocaleString("en-US")}
        </text>
      </svg>
      {hot !== null ? (
        <div className="tip" style={{ left: `${((l + slot * hot + slot / 2) / w) * 100}%`, top: 0 }}>
          <b>{days[hot].kcal === null ? "Not logged" : `${days[hot].kcal!.toLocaleString("en-US")} kcal`}</b>
          {days[hot].date}
        </div>
      ) : null}
    </div>
  );
}
