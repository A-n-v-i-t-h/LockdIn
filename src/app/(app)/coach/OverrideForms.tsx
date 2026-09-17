"use client";

import { useFormSubmit } from "@/components/useFormSubmit";
import { overrideLoadAction, overrideTargetsAction, type OverrideState } from "@/app/actions/fitness";

export function OverrideLoadForm({ track, suggested, changeRef }: { track: string; suggested: number | null; changeRef: string }) {
  const [state, onSubmit, pending] = useFormSubmit<OverrideState>(overrideLoadAction);
  return (
    <form onSubmit={onSubmit} className="stack tight" style={{ marginTop: 6 }}>
      <input type="hidden" name="track" value={track} />
      <input type="hidden" name="changeRef" value={changeRef} />
      <div className="grid2">
        <label className="field">
          <span>Load from today (kg)</span>
          <input className="input num" name="weight" inputMode="decimal" defaultValue={suggested ?? ""} required />
        </label>
        <label className="field">
          <span>Why</span>
          <input className="input" name="reason" maxLength={300} placeholder="e.g. elbow sore" />
        </label>
      </div>
      {state?.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" className="btn small" disabled={pending}>
        Save override
      </button>
    </form>
  );
}

export function OverrideTargetsForm({ current }: { current: { kcal: number; protein: number; carbs: number; fat: number } }) {
  const [state, onSubmit, pending] = useFormSubmit<OverrideState>(overrideTargetsAction);
  return (
    <form onSubmit={onSubmit} className="stack tight" style={{ marginTop: 6 }}>
      <div className="grid4">
        {(["kcal", "protein", "carbs", "fat"] as const).map((k) => (
          <label key={k} className="field">
            <span>{k === "kcal" ? "Kcal" : k[0].toUpperCase() + k.slice(1)}</span>
            <input className="input num" name={k} inputMode="decimal" defaultValue={current[k]} required />
          </label>
        ))}
      </div>
      <label className="field">
        <span>Why</span>
        <input className="input" name="reason" maxLength={300} placeholder="e.g. plan recalculated at 65 kg" />
      </label>
      <p className="sm t3">Protein and fat are frozen by the plan; carbs are the dial. The macros must add up to the calories.</p>
      {state?.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" className="btn small" disabled={pending}>
        Save targets
      </button>
    </form>
  );
}
