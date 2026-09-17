import Link from "next/link";
import type { CoachNote } from "@/lib/fitness/coach";
import { localTime } from "@/lib/time";

/** The coach's note, rendered as a work-order slip. */
export function WorkOrder({ note, asOf, compact = false, revision }: { note: CoachNote; asOf: string; compact?: boolean; revision?: number }) {
  const lines = compact ? note.lines.filter((l) => l.kind !== "next").slice(0, 4) : note.lines;
  const hidden = note.lines.length - lines.length;
  return (
    <section className="st-order" aria-label="Coach note">
      <div className="row">
        <span className="no">{note.number}</span>
        <span className="lbl">
          Coach · {localTime(new Date(asOf))}
          {revision && revision > 1 ? ` · rev ${revision}` : ""}
        </span>
      </div>
      <p className="headline">{note.headline}</p>
      {lines.length > 0 && (
        <ul>
          {lines.map((l, i) => (
            <li key={i} className={`k-${l.kind}`}>
              <span>
                {l.text}
                {l.rule ? <span className="rule">[{l.rule}]</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      {compact && (
        <Link href="/coach" className="sm">
          {hidden > 0 ? `${hidden} more in the coach log →` : "Coach log →"}
        </Link>
      )}
    </section>
  );
}
