"use client";

import { useState } from "react";
import { useFormSubmit } from "@/components/useFormSubmit";
import { saveMeasurementsAction, type MeasureState } from "@/app/actions/fitness";
import { resizeImage } from "@/components/resizeImage";

export function MeasureForm({
  today,
  kinds,
  latest,
}: {
  today: string;
  kinds: { key: string; label: string; how: string }[];
  latest: Record<string, { date: string; cm: number }>;
}) {
  const [state, onSubmit, pending] = useFormSubmit<MeasureState>(saveMeasurementsAction, { resetOn: (s) => !!s.ok });
  const [notes, setNotes] = useState<Record<string, string>>({});

  async function onPhoto(kind: string, e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const resized = await resizeImage(f, 1600);
      const dt = new DataTransfer();
      dt.items.add(resized);
      e.target.files = dt.files;
      setNotes((n) => ({ ...n, [kind]: `${Math.round(resized.size / 1024)} KB` }));
    } catch {
      e.target.value = "";
      setNotes((n) => ({ ...n, [kind]: "Couldn't read that photo" }));
    }
  }

  return (
    <form onSubmit={onSubmit} className="card">
      <label className="field">
        <span>Date</span>
        <input className="input" type="date" name="date" defaultValue={today} max={today} required />
      </label>
      <div className="grid2">
        {kinds.map((k) => (
          <label key={k.key} className="field">
            <span>{k.label} (cm)</span>
            <input className="input num" name={k.key} inputMode="decimal" placeholder={latest[k.key] ? String(latest[k.key].cm) : ""} aria-describedby={`how-${k.key}`} />
            <span id={`how-${k.key}`} className="sm t3" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>
              {k.how}
            </span>
          </label>
        ))}
      </div>
      <details className="more">
        <summary>Photos: front, side, back</summary>
        <div className="stack" style={{ marginTop: 8 }}>
          {(["front", "side", "back"] as const).map((kind) => (
            <label key={kind} className="field">
              <span>
                {kind}
                {notes[kind] ? ` · ${notes[kind]}` : ""}
              </span>
              <input className="input" type="file" name={`photo_${kind}`} accept="image/*" onChange={(e) => onPhoto(kind, e)} />
            </label>
          ))}
          <p className="sm t3">Relaxed, same spot, same light, morning. Photos are resized on this phone before upload.</p>
        </div>
      </details>
      {state?.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state?.ok ? (
        <p className="form-ok" role="status">
          {state.ok}
        </p>
      ) : null}
      <button type="submit" className="btn" disabled={pending}>
        {pending ? "Saving…" : "Save measurements"}
      </button>
    </form>
  );
}
