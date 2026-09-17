"use client";

import { useRef, useState } from "react";
import { useFormSubmit } from "@/components/useFormSubmit";
import { saveTonightAction, type TonightState } from "@/app/actions/fitness";
import { Icon } from "@/components/Icon";
import { resizeImage } from "@/components/resizeImage";

type Totals = { kcal: number; protein: number; carbs: number; fat: number; note: string };

export function TonightForm({
  date,
  initial,
  target,
}: {
  date: string;
  initial: Totals | null;
  target: { kcal: number; protein: number; carbs: number; fat: number };
}) {
  const [state, onSubmit, pending] = useFormSubmit<TonightState>(saveTonightAction);
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState({
    kcal: initial ? String(initial.kcal) : "",
    protein: initial ? String(initial.protein) : "",
    carbs: initial ? String(initial.carbs) : "",
    fat: initial ? String(initial.fat) : "",
  });
  const computed =
    values.protein && values.carbs && values.fat
      ? Math.round(Number(values.protein) * 4 + Number(values.carbs) * 4 + Number(values.fat) * 9)
      : null;

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    setPhotoError(null);
    const f = e.target.files?.[0];
    if (!f) return setPhotoName(null);
    try {
      const resized = await resizeImage(f, 1280);
      const dt = new DataTransfer();
      dt.items.add(resized);
      e.target.files = dt.files;
      setPhotoName(`${f.name} · ${Math.round(resized.size / 1024)} KB`);
    } catch {
      setPhotoError("Couldn't read that photo.");
      e.target.value = "";
      setPhotoName(null);
    }
  }

  const field = (name: keyof typeof values, label: string, unit: string, tgt: number) => (
    <label className="field">
      <span>{label}</span>
      <input
        className="input num"
        name={name}
        inputMode="decimal"
        autoComplete="off"
        value={values[name]}
        onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value.replace(/[^0-9.,]/g, "") }))}
        placeholder={String(tgt)}
        aria-describedby={`${name}-unit`}
        required
      />
      <span id={`${name}-unit`} className="sm t3" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>
        {unit} · target {tgt}
      </span>
    </label>
  );

  return (
    <form onSubmit={onSubmit} className="stack">
      <input type="hidden" name="date" value={date} />
      <section className="card">
        <div className="grid2">
          {field("kcal", "Calories", "kcal", target.kcal)}
          {field("protein", "Protein", "g", target.protein)}
          {field("carbs", "Carbs", "g", target.carbs)}
          {field("fat", "Fat", "g", target.fat)}
        </div>
        {computed !== null && values.kcal && Math.abs(computed - Number(values.kcal)) / Math.max(1, Number(values.kcal)) > 0.15 ? (
          <p className="sm warn">The macros add up to about {computed.toLocaleString("en-US")} kcal. Check the totals.</p>
        ) : null}
        <details className="more">
          <summary>Add a meal note or photo (optional)</summary>
          <div className="stack" style={{ marginTop: 8 }}>
            <label className="field">
              <span>One line about a meal</span>
              <input className="input" name="note" defaultValue={initial?.note ?? ""} maxLength={1000} placeholder="e.g. paneer tikka and 2 roti" />
            </label>
            <p className="sm t3">Foods from your plan&apos;s library get their numbers and notes. Nothing else is judged.</p>
            <label className="field">
              <span>Meal photo</span>
              <input ref={fileRef} className="input" type="file" name="photo" accept="image/*" capture="environment" onChange={onPhoto} />
            </label>
            {photoName ? <p className="sm t2">{photoName}</p> : null}
            {photoError ? <p className="form-error">{photoError}</p> : null}
            <p className="sm t3">Photos are stored with the day. Reading them needs the AI key, which isn&apos;t set up.</p>
          </div>
        </details>
      </section>
      {state?.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" className="btn" disabled={pending}>
        <Icon name="check" size={18} stroke={2.4} /> {pending ? "Saving…" : initial ? "Update totals" : "Save totals"}
      </button>
      {state?.saved ? (
        <section className="card accent-edge" role="status" aria-live="polite">
          <span className="lbl">Saved · what it says</span>
          <ul className="fb">
            {state.saved.feedback.map((f, i) => (
              <li key={i} className={f.tone}>
                {f.text}
              </li>
            ))}
            {state.saved.meal.map((f, i) => (
              <li key={`m${i}`} className={f.tone}>
                {f.text}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </form>
  );
}
