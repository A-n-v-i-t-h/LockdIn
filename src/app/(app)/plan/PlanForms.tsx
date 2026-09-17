"use client";

import { useEffect, useRef } from "react";
import { useFormSubmit } from "@/components/useFormSubmit";
import { saveHabitAction, saveTaskAction, type ModuleState } from "@/app/actions/modules";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function AddTaskForm({ defaultDue }: { today: string; defaultDue: string }) {
  const [state, onSubmit, pending] = useFormSubmit<ModuleState>(saveTaskAction, { resetOn: (s) => !!s.ok });
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.querySelector<HTMLInputElement>("input[name=title]")?.focus();
  }, [state?.nonce, state?.ok]);
  return (
    <form ref={ref} onSubmit={onSubmit} className="card" aria-label="Add a task">
      <div className="row" style={{ alignItems: "stretch" }}>
        <label className="field grow">
          <span className="sr-only">Task</span>
          <input className="input" name="title" placeholder="Add a task" maxLength={300} required autoComplete="off" />
        </label>
        <button type="submit" className="btn inline" disabled={pending} aria-label="Add task" style={{ minWidth: 64 }}>
          +
        </button>
      </div>
      <details className="more">
        <summary>Date, time, priority</summary>
        <div className="grid2" style={{ marginTop: 6 }}>
          <label className="field">
            <span>Due</span>
            <input className="input" type="date" name="dueDate" defaultValue={defaultDue} />
          </label>
          <label className="field">
            <span>Time</span>
            <input className="input" type="time" name="dueTime" />
          </label>
        </div>
        <div className="stack" style={{ marginTop: 10 }}>
          <label className="field">
            <span>Priority</span>
            <select className="select" name="priority" defaultValue="none">
              <option value="none">None</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
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
    </form>
  );
}

export function HabitForm({ habit }: { habit: { id: string; name: string; days: number[] } | null }) {
  const [state, onSubmit, pending] = useFormSubmit<ModuleState>(saveHabitAction, { resetOn: (s) => !!s.ok && !habit });
  return (
    <form onSubmit={onSubmit} className="stack tight" style={{ marginTop: 6 }}>
      {habit ? <input type="hidden" name="id" value={habit.id} /> : null}
      <label className="field">
        <span>Habit</span>
        <input className="input" name="name" defaultValue={habit?.name ?? ""} maxLength={120} required placeholder="e.g. In bed by midnight" />
      </label>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="lbl" style={{ marginBottom: 6 }}>
          Days
        </legend>
        <div className="wrap">
          {DAYS.map((d, i) => (
            <label key={d} className="chip" style={{ cursor: "pointer" }}>
              <input type="checkbox" name="days" value={i + 1} defaultChecked={habit ? habit.days.includes(i + 1) : true} style={{ accentColor: "var(--accent)" }} />
              {d}
            </label>
          ))}
        </div>
      </fieldset>
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
      <button type="submit" className="btn small" disabled={pending}>
        {habit ? "Save habit" : "Add habit"}
      </button>
    </form>
  );
}
