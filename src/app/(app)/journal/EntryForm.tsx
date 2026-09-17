"use client";

import { useState } from "react";
import { useFormSubmit } from "@/components/useFormSubmit";
import Link from "next/link";
import { saveEntryAction, type ModuleState } from "@/app/actions/modules";
import type { Entry } from "@/lib/modules/journal";

export function EntryForm({ tags, today, entry }: { tags: string[]; today: string; entry: Entry | null }) {
  const [picked, setPicked] = useState<string[]>(entry?.tags ?? []);
  const [state, onSubmit, pending] = useFormSubmit<ModuleState>(saveEntryAction, {
    resetOn: (s) => !!s.ok && !entry,
    after: (s) => {
      if (s.ok && !entry) setPicked([]);
    },
  });
  const toggle = (t: string) => setPicked((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));

  return (
    <form onSubmit={onSubmit} className="stack tight">
      {entry ? <input type="hidden" name="id" value={entry.id} /> : null}
      {picked.map((t) => (
        <input key={t} type="hidden" name="tags" value={t} />
      ))}
      <label className="field">
        <span className="sr-only">Entry</span>
        <textarea className="textarea" name="body" defaultValue={entry?.body ?? ""} maxLength={20000} required placeholder="Bench felt strong the whole way…" />
      </label>
      <div className="wrap" role="group" aria-label="Tags">
        {tags.map((t) => (
          <button key={t} type="button" className="chip" aria-pressed={picked.includes(t)} onClick={() => toggle(t)}>
            {t}
          </button>
        ))}
      </div>
      <div className="row">
        <label className="field">
          <span>Date</span>
          <input className="input" type="date" name="entryDate" defaultValue={entry?.entryDate ?? today} max={today} />
        </label>
        <button type="submit" className="btn inline" disabled={pending} style={{ alignSelf: "flex-end" }}>
          {entry ? "Save" : "Add entry"}
        </button>
      </div>
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
      {entry ? (
        <Link href="/journal" className="link">
          Cancel editing
        </Link>
      ) : null}
    </form>
  );
}
