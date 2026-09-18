import Link from "next/link";
import type { AiNote as AiNoteRow } from "@/lib/ai/coach";
import { localTime } from "@/lib/time";

/** The AI coach's note. Marked when the rules have re-run on newer entries since it was written. */
export function AiNote({ note, runAsOf, pending, link = true }: { note: AiNoteRow; runAsOf: string; pending: number; link?: boolean }) {
  const stale = runAsOf > note.recordedAt;
  return (
    <section className="card accent-edge" aria-label="AI coach note">
      <div className="row">
        <span className="lbl">
          AI coach{note.kind === "weekly" ? " · weekly review" : ""} · {localTime(new Date(note.recordedAt))}
        </span>
        {pending > 0 ? <span className="chip warn">{pending} to approve</span> : null}
      </div>
      <p style={{ whiteSpace: "pre-line", margin: 0 }}>{note.note}</p>
      {stale ? <p className="sm t3">Written before your latest entries; the card below uses them.</p> : null}
      {link ? (
        <Link href="/coach#ai" className="sm">
          {pending > 0 ? "Review proposals →" : "AI coach log →"}
        </Link>
      ) : null}
    </section>
  );
}
