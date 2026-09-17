"use client";

import { useFormSubmit } from "@/components/useFormSubmit";
import { saveTaskAction, type ModuleState } from "@/app/actions/modules";
import type { Task } from "@/lib/modules/tasks";

export function EditTaskForm({ task }: { task: Task }) {
  const [state, onSubmit, pending] = useFormSubmit<ModuleState>(saveTaskAction);
  return (
    <form onSubmit={onSubmit} className="card">
      <input type="hidden" name="id" value={task.id} />
      <input type="hidden" name="back" value="/plan" />
      <label className="field">
        <span>Title</span>
        <input className="input" name="title" defaultValue={task.title} maxLength={300} required />
      </label>
      <div className="grid2">
        <label className="field">
          <span>Due date</span>
          <input className="input" type="date" name="dueDate" defaultValue={task.dueDate ?? ""} />
        </label>
        <label className="field">
          <span>Time</span>
          <input className="input" type="time" name="dueTime" defaultValue={task.dueTime ?? ""} />
        </label>
      </div>
      <label className="field">
        <span>Priority</span>
        <select className="select" name="priority" defaultValue={task.priority}>
          <option value="none">None</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </label>
      <label className="field">
        <span>Notes</span>
        <textarea className="textarea" name="notes" defaultValue={task.notes} maxLength={4000} />
      </label>
      {state?.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" className="btn" disabled={pending}>
        Save task
      </button>
    </form>
  );
}
