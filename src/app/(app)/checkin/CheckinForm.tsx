"use client";

import { useEffect, useState } from "react";
import { useFormSubmit } from "@/components/useFormSubmit";
import { saveCheckinAction, type CheckinState } from "@/app/actions/fitness";
import { Icon } from "@/components/Icon";

type Field = "weight" | "waist";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"];

function applyKey(value: string, key: string, maxDecimals: number): string {
  if (key === "del") return value.slice(0, -1);
  if (key === ".") {
    if (value.includes(".")) return value;
    return value === "" ? "0." : `${value}.`;
  }
  const [int, dec] = value.split(".");
  if (dec !== undefined && dec.length >= maxDecimals) return value;
  if (dec === undefined && int.length >= 3) return value;
  if (value === "0") return key;
  return value + key;
}

function sleepLength(bed: string, wake: string): string | null {
  if (!/^\d\d:\d\d$/.test(bed) || !/^\d\d:\d\d$/.test(wake)) return null;
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  let m = toMin(wake) - toMin(bed);
  if (m <= 0) m += 24 * 60;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} m` : `${h} h`;
}

export function CheckinForm(props: {
  date: string;
  today: string;
  dateLabel: string;
  mondayWaist: boolean;
  initial: { weight: number | null; protocolOk: boolean; bed: string; wake: string; waist: number | null };
  sleepFromHistory: boolean;
  previous: { date: string; weight: number } | null;
  previousAvg: number | null;
  lastWaist: { date: string; cm: number } | null;
  editing: boolean;
}) {
  const [state, onSubmit, pending] = useFormSubmit<CheckinState>(saveCheckinAction);
  const [weight, setWeight] = useState(props.initial.weight === null ? "" : String(props.initial.weight));
  const [waist, setWaist] = useState(props.initial.waist === null ? "" : String(props.initial.waist));
  const [field, setField] = useState<Field>("weight");
  const [bed, setBed] = useState(props.initial.bed);
  const [wake, setWake] = useState(props.initial.wake);
  const showWaist = props.mondayWaist || props.initial.waist !== null;

  const press = (key: string) => {
    if (field === "weight") setWeight((v) => applyKey(v, key, 2));
    else setWaist((v) => applyKey(v, key, 1));
  };
  const sleep = sleepLength(bed, wake);

  // A physical keyboard works too, unless the cursor is in a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = /^[0-9]$/.test(e.key) ? e.key : e.key === "." || e.key === "," ? "." : e.key === "Backspace" ? "del" : null;
      if (!key) return;
      e.preventDefault();
      if (field === "weight") setWeight((v) => applyKey(v, key, 2));
      else setWaist((v) => applyKey(v, key, 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [field]);

  return (
    <form onSubmit={onSubmit} className="stack" style={{ gap: 14 }}>
      <input type="hidden" name="date" value={props.date} />
      <input type="hidden" name="weight" value={weight} />
      <input type="hidden" name="waist" value={waist} />

      <div className="readout">
        <div className="eyebrow">
          {props.dateLabel}
          {props.date !== props.today ? " · editing a past day" : ""} · after the bathroom, before food
        </div>
        <button type="button" onClick={() => setField("weight")} aria-label={`Weight: ${weight ? `${weight} kg` : "not entered"}. The keypad edits this.`} className={field === "weight" ? "active" : ""}>
          <span className={`big xl${weight ? "" : " t3"}`} data-testid="weight-readout">
            {weight || "00.0"}
          </span>
          <span className="unit">kg</span>
        </button>
        <div className="sm t2">
          {props.previous ? `Last reading ${props.previous.weight.toFixed(1)} kg (${props.previous.date}).` : "First weigh-in."}
          {props.previousAvg !== null ? ` 7-day average so far ${props.previousAvg.toFixed(2)} kg.` : ""}
        </div>
      </div>

      {showWaist ? (
        <div className="targets" role="group" aria-label="Which number the keypad edits">
          <button type="button" aria-pressed={field === "weight"} onClick={() => setField("weight")}>
            <span className="lbl">Weight</span>
            <b>{weight || "—"}</b>
          </button>
          <button type="button" aria-pressed={field === "waist"} onClick={() => setField("waist")}>
            <span className="lbl">Waist at navel {props.mondayWaist ? "· Monday" : ""}</span>
            <b data-testid="waist-readout">{waist ? `${waist} cm` : "—"}</b>
          </button>
        </div>
      ) : null}

      <div className="kp" aria-label="Number pad">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            aria-label={k === "del" ? "Delete" : k === "." ? "Decimal point" : k}
          >
            {k === "del" ? "⌫" : k}
          </button>
        ))}
      </div>

      {field === "waist" && props.lastWaist ? (
        <p className="sm t2">
          Last waist {props.lastWaist.cm} cm ({props.lastWaist.date}). Tape level at the navel, relaxed exhale, nearest 0.5 cm.
        </p>
      ) : null}

      <label className="check">
        <input type="checkbox" name="protocol" defaultChecked={props.initial.protocolOk} />
        <span>
          Taken under the fixed conditions: after the bathroom, before food or water, same scale.
          <span className="t3"> Readings outside them are kept but left out of the average.</span>
        </span>
      </label>

      <section className="card" aria-labelledby="sleep-h">
        <div className="row">
          <span id="sleep-h" className="lbl">
            Sleep
          </span>
          <span className="chip">
            <Icon name="moon" size={12} /> {sleep ?? "—"}
          </span>
        </div>
        <div className="grid2">
          <label className="field">
            <span>In bed</span>
            <input className="input num" type="time" name="bed" value={bed} onChange={(e) => setBed(e.target.value)} />
          </label>
          <label className="field">
            <span>Woke</span>
            <input className="input num" type="time" name="wake" value={wake} onChange={(e) => setWake(e.target.value)} />
          </label>
        </div>
        <p className="sm t3">
          {props.editing ? "Saved times. Change them if they're off." : props.sleepFromHistory ? "Filled from your last check-in. Change what differs." : "Usual times. Change them to tonight's."}
        </p>
      </section>

      {state?.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" className="btn" disabled={pending}>
        <Icon name="check" size={18} stroke={2.4} /> {pending ? "Saving…" : props.editing ? "Update check-in" : "Save check-in"}
      </button>
    </form>
  );
}
