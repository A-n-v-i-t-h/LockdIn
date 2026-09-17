"use client";

import { useState } from "react";
import { useFormSubmit } from "@/components/useFormSubmit";
import { createGoalAction, updateGoalAction, type ModuleState } from "@/app/actions/modules";

const CATEGORIES = ["Strength", "Body", "Build", "Mind", "Money", "General"];

export function GoalCreateForm() {
  const [state, onSubmit, pending] = useFormSubmit<ModuleState>(createGoalAction, { resetOn: (s) => !!s.ok });
  const [kind, setKind] = useState<"manual" | "auto">("manual");
  return (
    <form onSubmit={onSubmit} className="card" style={{ marginTop: 6 }}>
      <label className="field">
        <span>Goal</span>
        <input className="input" name="title" maxLength={200} required placeholder="e.g. Read 12 books" />
      </label>
      <div className="grid2">
        <label className="field">
          <span>Category</span>
          <select className="select" name="category" defaultValue="General">
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Deadline</span>
          <input className="input" type="date" name="targetDate" />
        </label>
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="lbl" style={{ marginBottom: 6 }}>
          Progress comes from
        </legend>
        <div className="seg">
          <button type="button" aria-pressed={kind === "manual"} onClick={() => setKind("manual")}>
            Milestones
          </button>
          <button type="button" aria-pressed={kind === "auto"} onClick={() => setKind("auto")}>
            My logs
          </button>
        </div>
      </fieldset>
      <input type="hidden" name="kind" value={kind} />
      {kind === "manual" ? (
        <label className="field">
          <span>Milestones, one per line</span>
          <textarea className="textarea" name="milestones" placeholder={"Book 1\nBook 2"} style={{ minHeight: 80 }} />
        </label>
      ) : (
        <div className="grid2">
          <label className="field">
            <span>Tracks</span>
            <select className="select" name="metric" defaultValue="bench_e1rm">
              <option value="bench_e1rm">Bench estimated max (kg)</option>
              <option value="bodyweight_avg">7-day average weight (kg)</option>
            </select>
          </label>
          <label className="field">
            <span>Target</span>
            <input className="input num" name="targetValue" inputMode="decimal" required />
          </label>
        </div>
      )}
      <label className="field">
        <span>Notes</span>
        <input className="input" name="notes" maxLength={2000} />
      </label>
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
        Add goal
      </button>
    </form>
  );
}

export function GoalEditForm({
  goal,
}: {
  goal: { id: string; title: string; category: string; targetDate: string | null; notes: string; kind: "manual" | "auto"; targetValue: number | null };
}) {
  const [state, onSubmit, pending] = useFormSubmit<ModuleState>(updateGoalAction);
  return (
    <form onSubmit={onSubmit} className="stack tight" style={{ marginTop: 6 }}>
      <input type="hidden" name="id" value={goal.id} />
      <label className="field">
        <span>Goal</span>
        <input className="input" name="title" defaultValue={goal.title} maxLength={200} required />
      </label>
      <div className="grid2">
        <label className="field">
          <span>Category</span>
          <select className="select" name="category" defaultValue={goal.category}>
            {[...new Set([goal.category, ...CATEGORIES])].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Deadline</span>
          <input className="input" type="date" name="targetDate" defaultValue={goal.targetDate ?? ""} />
        </label>
      </div>
      {goal.kind === "auto" ? (
        <label className="field">
          <span>Target</span>
          <input className="input num" name="targetValue" inputMode="decimal" defaultValue={goal.targetValue ?? ""} />
        </label>
      ) : null}
      <label className="field">
        <span>Notes</span>
        <input className="input" name="notes" defaultValue={goal.notes} maxLength={2000} />
      </label>
      {state?.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" className="btn small" disabled={pending}>
        Save goal
      </button>
    </form>
  );
}
