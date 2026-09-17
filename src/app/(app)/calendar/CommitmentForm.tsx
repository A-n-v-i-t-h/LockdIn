"use client";

import { useFormSubmit } from "@/components/useFormSubmit";
import Link from "next/link";
import { saveCommitmentAction, type ModuleState } from "@/app/actions/modules";
import type { Commitment } from "@/lib/modules/calendar";

export function CommitmentForm({ date, commitment }: { date: string; commitment: Commitment | null }) {
  const [state, onSubmit, pending] = useFormSubmit<ModuleState>(saveCommitmentAction);
  return (
    <form onSubmit={onSubmit} className="card">
      {commitment ? <input type="hidden" name="id" value={commitment.id} /> : null}
      <label className="field">
        <span>What</span>
        <input className="input" name="title" defaultValue={commitment?.title ?? ""} maxLength={200} required placeholder="e.g. Client call" />
      </label>
      <label className="field">
        <span>Date</span>
        <input className="input" type="date" name="date" defaultValue={commitment?.date ?? date} required />
      </label>
      <div className="grid2">
        <label className="field">
          <span>Start</span>
          <input className="input" type="time" name="startTime" defaultValue={commitment?.startTime ?? ""} />
        </label>
        <label className="field">
          <span>End</span>
          <input className="input" type="time" name="endTime" defaultValue={commitment?.endTime ?? ""} />
        </label>
      </div>
      <label className="field">
        <span>Where</span>
        <input className="input" name="location" defaultValue={commitment?.location ?? ""} maxLength={200} placeholder="Optional" />
      </label>
      <label className="field">
        <span>Notes</span>
        <input className="input" name="notes" defaultValue={commitment?.notes ?? ""} maxLength={2000} />
      </label>
      <p className="sm t3">Leave the times empty for an all-day item.</p>
      {state?.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" className="btn" disabled={pending}>
        {commitment ? "Save commitment" : "Add to calendar"}
      </button>
      {commitment ? (
        <Link href={`/calendar?m=${commitment.date.slice(0, 7)}&d=${commitment.date}`} className="link center">
          Cancel
        </Link>
      ) : null}
    </form>
  );
}
