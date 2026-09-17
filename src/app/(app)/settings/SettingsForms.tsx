"use client";

import { useFormSubmit } from "@/components/useFormSubmit";
import { changePasswordAction, type FormState } from "@/app/actions/auth";
import { saveGymAction, type MeasureState } from "@/app/actions/fitness";
import type { GymSettings } from "@/lib/fitness/equipment";

const PLATE_OPTIONS = [25, 20, 15, 10, 5, 2.5, 2, 1.25, 1, 0.5];

export function GymForm({ gym }: { gym: GymSettings }) {
  const [state, onSubmit, pending] = useFormSubmit<MeasureState>(saveGymAction);
  const confirm = (name: keyof GymSettings["confirmed"], label: string) => (
    <label className="check">
      <input type="checkbox" name={`confirm_${name}`} defaultChecked={gym.confirmed[name]} />
      <span>{label}</span>
    </label>
  );
  return (
    <form onSubmit={onSubmit} className="card">
      <label className="field">
        <span>Olympic bar (kg)</span>
        <input className="input num" name="barKg" inputMode="decimal" defaultValue={gym.barKg} required />
      </label>
      {confirm("bar", "Bar weight checked at the gym")}

      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="lbl" style={{ marginBottom: 6 }}>
          Plates available (kg each)
        </legend>
        <div className="wrap">
          {PLATE_OPTIONS.map((p) => (
            <label key={p} className="chip" style={{ cursor: "pointer" }}>
              <input type="checkbox" name="plates" value={p} defaultChecked={gym.plates.includes(p)} style={{ accentColor: "var(--accent)" }} />
              {p}
            </label>
          ))}
        </div>
      </fieldset>
      {confirm("plates", "Smallest plate checked (it sets every barbell jump)")}

      <div className="grid3">
        <label className="field">
          <span>DB step</span>
          <input className="input num" name="dumbbellStep" inputMode="decimal" defaultValue={gym.dumbbellStep} />
        </label>
        <label className="field">
          <span>Lightest DB</span>
          <input className="input num" name="dumbbellMin" inputMode="decimal" defaultValue={gym.dumbbellMin} />
        </label>
        <label className="field">
          <span>Heaviest DB</span>
          <input className="input num" name="dumbbellMax" inputMode="decimal" defaultValue={gym.dumbbellMax} />
        </label>
      </div>
      {confirm("dumbbells", "Dumbbell range and step checked")}

      <label className="field">
        <span>Cable stack step (kg)</span>
        <input className="input num" name="cableStep" inputMode="decimal" defaultValue={gym.cableStep} />
      </label>
      {confirm("cable", "Cable stack step checked on the crossover")}

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
        Save gym
      </button>
    </form>
  );
}

export function PasswordForm() {
  const [state, onSubmit, pending] = useFormSubmit<FormState>(changePasswordAction);
  return (
    <form onSubmit={onSubmit} className="card" aria-label="Change password">
      <label className="field">
        <span>Current password</span>
        <input className="input" type="password" name="current" autoComplete="current-password" required />
      </label>
      <div className="grid2">
        <label className="field">
          <span>New password</span>
          <input className="input" type="password" name="next" autoComplete="new-password" minLength={10} required />
        </label>
        <label className="field">
          <span>Again</span>
          <input className="input" type="password" name="confirm" autoComplete="new-password" minLength={10} required />
        </label>
      </div>
      <p className="sm t3">At least 10 characters. Changing it signs out every other device.</p>
      {state?.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" className="btn small" disabled={pending}>
        Change password
      </button>
    </form>
  );
}
