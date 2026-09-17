"use client";

import { useRef, useState } from "react";

export interface WeightPoint {
  date: string;
  avg: number | null;
  daily: number | null;
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const short = (d: string) => `${Number(d.slice(8))} ${MON[Number(d.slice(5, 7)) - 1]}`;

/** 7-day average line over daily dots, with the ramp-in zone and calorie changes marked. */
export function WeightChart({
  points,
  rampInEnd,
  markers,
}: {
  points: WeightPoint[];
  rampInEnd: string;
  markers: { date: string; label: string }[];
}) {
  const w = 320;
  const h = 180;
  const l = 32;
  const r = 44;
  const t = 18;
  const b = 24;
  const [hover, setHover] = useState<{ i: number; scale: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const values = points.flatMap((p) => [p.avg, p.daily]).filter((v): v is number => v !== null);
  if (values.length === 0 || points.length < 2) {
    return <div className="empty">No weigh-ins yet. The 7-day average appears after the first few mornings.</div>;
  }
  const lo = Math.floor(Math.min(...values) - 0.3);
  const hi = Math.ceil(Math.max(...values) + 0.3);
  const n = points.length;
  const x = (i: number) => l + (i * (w - l - r)) / (n - 1);
  const y = (v: number) => t + ((hi - v) * (h - t - b)) / (hi - lo || 1);
  const stepKg = hi - lo > 8 ? 2 : hi - lo > 4 ? 1 : 0.5;
  const grid: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += stepKg) grid.push(Math.round(v * 10) / 10);

  const rampIdx = points.findIndex((p) => p.date > rampInEnd);
  const zoneEnd = rampIdx === -1 ? n - 1 : Math.max(0, rampIdx - 1);
  const hasRamp = points[0].date <= rampInEnd;

  const segs: string[] = [];
  let cur: string[] = [];
  points.forEach((p, i) => {
    if (p.avg === null) {
      if (cur.length) segs.push(cur.join(" L"));
      cur = [];
    } else cur.push(`${x(i).toFixed(1)},${y(p.avg).toFixed(1)}`);
  });
  if (cur.length) segs.push(cur.join(" L"));

  const lastIdx = [...points.keys()].reverse().find((i) => points[i].avg !== null) ?? null;
  const tickEvery = Math.max(1, Math.ceil(n / 4));
  const ticks = points.map((p, i) => ({ p, i })).filter(({ i }) => i % tickEvery === 0);

  const onMove = (e: React.PointerEvent) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return;
    const vx = ((e.clientX - box.left) * w) / box.width;
    const i = Math.max(0, Math.min(n - 1, Math.round(((vx - l) * (n - 1)) / (w - l - r))));
    setHover({ i, scale: box.width / w });
  };
  const hp = hover !== null ? points[hover.i] : null;

  const last = lastIdx !== null ? points[lastIdx] : null;
  const summary = last?.avg != null ? `7-day average weight from ${short(points[0].date)} to ${short(last.date)}, now ${last.avg.toFixed(2)} kg.` : "Weight chart";

  return (
    <div className="chart" onPointerLeave={() => setHover(null)}>
      <svg ref={svgRef} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={summary}>
        {grid.map((v) => (
          <g key={v}>
            <line className="gl" x1={l} x2={w - r} y1={y(v)} y2={y(v)} />
            <text className="ax" x={l - 6} y={y(v) + 3} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        {hasRamp ? (
          <g>
            <rect className="zone" x={x(0)} y={t} width={Math.max(2, x(zoneEnd) - x(0))} height={h - t - b} />
            <text className="ax" x={x(0) + 4} y={t + 11}>
              Ramp-in
            </text>
          </g>
        ) : null}
        {ticks.map(({ p, i }) => (
          <text key={p.date} className="ax" x={x(i)} y={h - 6} textAnchor={i === 0 ? "start" : "middle"}>
            {short(p.date)}
          </text>
        ))}
        {points.map((p, i) =>
          p.daily !== null ? <circle key={p.date} className="dd" cx={x(i)} cy={y(p.daily)} r={1.8} /> : null,
        )}
        {markers.map((m) => {
          const i = points.findIndex((p) => p.date === m.date);
          if (i < 0) return null;
          return (
            <g key={m.date + m.label}>
              <line className="mkl" x1={x(i)} x2={x(i)} y1={t + 16} y2={h - b} />
              <text className="ax" x={x(i) - 4} y={t + 25} textAnchor="end">
                {m.label}
              </text>
            </g>
          );
        })}
        {segs.map((d, i) => (
          <path key={i} className="ln" d={`M${d}`} />
        ))}
        {last && last.avg !== null && lastIdx !== null ? (
          <g>
            <circle className="endpt" cx={x(lastIdx)} cy={y(last.avg)} r={4.5} />
            <text className="axr" x={x(lastIdx) + 8} y={y(last.avg) + 4}>
              {last.avg.toFixed(1)}
            </text>
          </g>
        ) : null}
        {hover !== null ? <line className="xh" x1={x(hover.i)} x2={x(hover.i)} y1={t} y2={h - b} /> : null}
        <rect className="hit" x={l} y={t} width={w - l - r} height={h - t - b} onPointerMove={onMove} onPointerDown={onMove} />
      </svg>
      {hp && hover ? (
        <div className="tip" style={{ left: `${x(hover.i) * hover.scale}px`, top: `${y(hp.avg ?? hp.daily ?? lo) * hover.scale}px` }}>
          <b>{hp.avg !== null ? `${hp.avg.toFixed(2)} kg average` : "No average"}</b>
          {short(hp.date)} · {hp.daily !== null ? `daily ${hp.daily.toFixed(1)} kg` : "no reading"}
        </div>
      ) : null}
    </div>
  );
}
