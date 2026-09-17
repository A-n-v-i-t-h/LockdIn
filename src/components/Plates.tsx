import { fmtKg } from "@/lib/fitness/equipment";

const SIZES: Record<string, { w: number; h: number }> = {
  "25": { w: 15, h: 46 },
  "20": { w: 14, h: 46 },
  "15": { w: 13, h: 42 },
  "10": { w: 12, h: 38 },
  "5": { w: 9, h: 30 },
  "2.5": { w: 8, h: 26 },
  "1.25": { w: 7, h: 20 },
};

/** One side of the bar, with the plates that are new tonight marked in red. */
export function Plates({ plates, barKg, totalKg }: { plates: { kg: number; fresh: boolean }[]; barKg: number; totalKg: number }) {
  let x = 96;
  const rects: React.ReactNode[] = [];
  const marks: React.ReactNode[] = [];
  plates.forEach((p, i) => {
    const s = SIZES[String(p.kg)] ?? { w: 8, h: Math.max(16, Math.min(46, 16 + p.kg * 1.2)) };
    const cls = `pl pl-${String(p.kg).replace(".", "_")}`;
    rects.push(<rect key={`p${i}`} className={cls} x={x} y={26 - s.h / 2} width={s.w} height={s.h} rx={1} />);
    if (p.fresh) {
      const cx = x + s.w / 2;
      const top = 26 - s.h / 2;
      marks.push(
        <g key={`m${i}`}>
          <path className="pl-new" d={`M${cx - 3.5},${top - 8} L${cx + 3.5},${top - 8} L${cx},${top - 3} Z`} />
          <text className="pl-lab pl-newt" x={cx} y={top - 11} textAnchor="middle">
            new
          </text>
        </g>,
      );
    }
    x += s.w + 2;
  });
  const perSide = plates.map((p) => fmtKg(p.kg)).join(" + ") || "empty bar";
  const fresh = plates.filter((p) => p.fresh).map((p) => `${fmtKg(p.kg)} kg`);
  const label = `${fmtKg(totalKg)} kg: ${fmtKg(barKg)} kg bar with ${plates.length ? `${perSide} kg per side` : "no plates"}.${fresh.length ? ` New tonight: ${fresh.join(", ")}.` : ""}`;
  return (
    <div className="plates">
      <svg viewBox="0 -12 300 76" role="img" aria-label={label}>
        <rect className="pl-bar" x={0} y={23.5} width={82} height={5} />
        <rect className="pl-bar" x={82} y={15} width={7} height={22} />
        <rect className="pl-bar" x={89} y={21.5} width={200} height={9} opacity={0.6} />
        {rects}
        {marks}
        <rect className="pl-bar" x={x + 1} y={17} width={5} height={18} />
        <text className="pl-lab" x={0} y={60}>
          {fmtKg(barKg)} kg bar
        </text>
        <text className="pl-lab" x={300} y={60} textAnchor="end">
          {plates.length ? `${perSide} kg per side` : "No plates"}
        </text>
      </svg>
    </div>
  );
}
