"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { finishSessionAction, logSetAction, removeSetAction, type LoggedView } from "@/app/actions/fitness";
import type { CardSlot } from "@/lib/fitness/card";
import { Icon } from "@/components/Icon";
import { Plates } from "@/components/Plates";
import { plural } from "@/lib/format";

export interface ExtraOption {
  key: string;
  name: string;
  track: string;
  equipment: string;
  loadHint: string;
}

interface Props {
  date: string;
  sessionKey: string;
  runId: string | null;
  slots: CardSlot[];
  initialSets: LoggedView[];
  barKg: number;
  bestSlot: string | null;
  extraOptions: ExtraOption[];
  initialSessionId: string | null;
}

interface ActiveExercise {
  key: string;
  name: string;
  track: string;
  substituteFor: string | null;
  loadMode: "external" | "added" | "none";
  loadHint: string;
  step: number;
  plannedWeight: number | null;
  plannedReps: number[];
}

type Editing = { slot: string; setIndex: number; weight: string; reps: string } | null;

function fmt(n: number | null): string {
  if (n === null) return "—";
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

function loadLabel(ex: ActiveExercise, w: number | null): string {
  if (ex.loadMode === "none") return "BW";
  if (w === null) return "—";
  if (ex.loadMode === "added") return w === 0 ? "BW" : `+${fmt(w)}`;
  return fmt(w);
}

/** Outside the component: reading the clock is an event-time side effect. */
function restUntil(seconds: number, label: string) {
  return { end: Date.now() + seconds * 1000, total: seconds, label };
}

function mmss(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function WorkoutLogger(props: Props) {
  const [sets, setSets] = useState<LoggedView[]>(props.initialSets);
  const [editing, setEditing] = useState<Editing>(null);
  const [subOn, setSubOn] = useState<Record<string, boolean>>(() => {
    const on: Record<string, boolean> = {};
    for (const s of props.initialSets) if (s.substituteFor) on[s.slot] = true;
    return on;
  });
  const [extraRows, setExtraRows] = useState<Record<string, number>>({});
  const [extras, setExtras] = useState<{ slot: string; option: ExtraOption }[]>(() => {
    const seen = new Map<string, ExtraOption>();
    for (const s of props.initialSets) {
      if (!s.slot.startsWith("x") || seen.has(s.slot)) continue;
      const opt = props.extraOptions.find((o) => o.key === s.exercise);
      if (opt) seen.set(s.slot, opt);
    }
    return [...seen.entries()].map(([slot, option]) => ({ slot, option }));
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [rest, setRest] = useState<{ end: number; total: number; label: string } | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [pick, setPick] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(props.initialSessionId);
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!rest) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNowMs(n);
      if (n >= rest.end) {
        clearInterval(t);
        if ("vibrate" in navigator) navigator.vibrate?.([120, 80, 120]);
      }
    }, 500);
    return () => clearInterval(t);
  }, [rest]);

  useEffect(() => {
    if (editing) editorRef.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, [editing]);

  const active = (slot: CardSlot): ActiveExercise => {
    const useSub = !!subOn[slot.slot] && !!slot.substitute;
    if (useSub && slot.substitute) {
      const sub = slot.substitute;
      return {
        key: sub.exercise.key,
        name: sub.exercise.name,
        track: sub.track,
        substituteFor: slot.exercise.key,
        loadMode: sub.exercise.loadMode,
        loadHint: sub.exercise.loadHint,
        step: sub.step,
        plannedWeight: sub.weight,
        plannedReps: sub.repTargets,
      };
    }
    return {
      key: slot.exercise.key,
      name: slot.label,
      track: slot.track,
      substituteFor: null,
      loadMode: slot.exercise.loadMode,
      loadHint: slot.exercise.loadHint,
      step: slot.step,
      plannedWeight: slot.weight,
      plannedReps: slot.repTargets,
    };
  };

  const bySlot = useMemo(() => {
    const m = new Map<string, LoggedView[]>();
    for (const s of sets) {
      const list = m.get(s.slot) ?? [];
      list.push(s);
      m.set(s.slot, list);
    }
    for (const list of m.values()) list.sort((a, b) => a.setIndex - b.setIndex);
    return m;
  }, [sets]);

  const doneCount = sets.length;
  const plannedCount = props.slots.filter((s) => !s.optional).reduce((a, s) => a + s.sets, 0);

  function save(slotKey: string, ex: ActiveExercise, setIndex: number, weight: number | null, reps: number, restSeconds: number) {
    setError(null);
    const previous = sets;
    const optimistic: LoggedView = {
      slot: slotKey,
      setIndex,
      exercise: ex.key,
      track: ex.track,
      substituteFor: ex.substituteFor,
      weight: ex.loadMode === "none" ? null : weight,
      reps,
    };
    setSets((cur) => [...cur.filter((s) => !(s.slot === slotKey && s.setIndex === setIndex)), optimistic]);
    setEditing(null);
    if (restSeconds > 0) setRest(restUntil(restSeconds, ex.name));
    startTransition(async () => {
      const res = await logSetAction({
        date: props.date,
        sessionKey: props.sessionKey,
        runId: props.runId,
        slot: slotKey,
        exercise: ex.key,
        track: ex.track,
        substituteFor: ex.substituteFor,
        setIndex,
        weight: ex.loadMode === "none" ? null : weight,
        reps,
        plannedWeight: ex.plannedWeight,
        plannedReps: ex.plannedReps[setIndex - 1] ?? null,
      });
      if (res.ok) {
        setSets(res.sets);
        setSessionId(res.sessionId);
      } else {
        setSets(previous);
        setError(res.error);
      }
    });
  }

  function remove(slotKey: string, setIndex: number) {
    setError(null);
    const previous = sets;
    setSets((cur) => cur.filter((s) => !(s.slot === slotKey && s.setIndex === setIndex)));
    setEditing(null);
    startTransition(async () => {
      const res = await removeSetAction({ date: props.date, slot: slotKey, setIndex });
      if (res.ok) setSets(res.sets);
      else {
        setSets(previous);
        setError(res.error);
      }
    });
  }

  function openEditor(slotKey: string, ex: ActiveExercise, setIndex: number) {
    const logged = bySlot.get(slotKey)?.find((s) => s.setIndex === setIndex);
    const lastWeight = [...(bySlot.get(slotKey) ?? [])].reverse().find((s) => s.weight !== null)?.weight ?? null;
    const w = logged ? logged.weight : ex.plannedWeight ?? lastWeight;
    const r = logged ? logged.reps : ex.plannedReps[setIndex - 1] ?? ex.plannedReps.at(-1) ?? 8;
    setEditing({ slot: slotKey, setIndex, weight: w === null ? "" : String(w), reps: String(r) });
  }

  function commitEditor(slotKey: string, ex: ActiveExercise, restSeconds: number) {
    if (!editing) return;
    const reps = Number(editing.reps);
    if (!Number.isInteger(reps) || reps < 0 || reps > 100) return setError("Reps must be a whole number from 0 to 100.");
    let weight: number | null = null;
    if (ex.loadMode !== "none") {
      if (editing.weight.trim() === "") return setError(ex.loadMode === "added" ? "Enter the added weight (0 for bodyweight)." : "Enter the weight.");
      weight = Number(editing.weight.replace(",", "."));
      if (!Number.isFinite(weight) || weight < 0 || weight > 500) return setError("Weight must be 0–500 kg.");
    }
    save(slotKey, ex, editing.setIndex, weight, reps, restSeconds);
  }

  const renderEditor = (slotKey: string, ex: ActiveExercise, restSeconds: number) => {
    if (!editing || editing.slot !== slotKey) return null;
    const logged = bySlot.get(slotKey)?.some((s) => s.setIndex === editing.setIndex);
    const bump = (field: "weight" | "reps", delta: number) =>
      setEditing((e) => {
        if (!e) return e;
        const cur = Number((field === "weight" ? e.weight : e.reps).replace(",", ".")) || 0;
        const next = Math.max(0, Math.round((cur + delta) * 1000) / 1000);
        return { ...e, [field]: String(next) };
      });
    return (
      <div className="editor" ref={editorRef} role="group" aria-label={`Edit set ${editing.setIndex}`}>
        <div className="row">
          <span className="lbl">Set {editing.setIndex}</span>
          <button type="button" className="iconbtn" onClick={() => setEditing(null)} aria-label="Close editor" style={{ width: 34, height: 34 }}>
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="grid2">
          {ex.loadMode !== "none" ? (
            <label className="field">
              <span>{ex.loadMode === "added" ? "Added kg" : "Kg"}</span>
              <div className="stepper">
                <button type="button" aria-label="Less weight" onClick={() => bump("weight", -(ex.step || 1))}>
                  −
                </button>
                <input
                  className="input num"
                  inputMode="decimal"
                  value={editing.weight}
                  onChange={(e) => setEditing({ ...editing, weight: e.target.value.replace(/[^0-9.,]/g, "") })}
                  aria-label="Weight in kilograms"
                />
                <button type="button" aria-label="More weight" onClick={() => bump("weight", ex.step || 1)}>
                  +
                </button>
              </div>
            </label>
          ) : (
            <div className="field">
              <span>Load</span>
              <p className="sub" style={{ paddingTop: 12 }}>
                Bodyweight
              </p>
            </div>
          )}
          <label className="field">
            <span>Reps</span>
            <div className="stepper">
              <button type="button" aria-label="One rep fewer" onClick={() => bump("reps", -1)}>
                −
              </button>
              <input
                className="input num"
                inputMode="numeric"
                value={editing.reps}
                onChange={(e) => setEditing({ ...editing, reps: e.target.value.replace(/[^0-9]/g, "") })}
                aria-label="Reps"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitEditor(slotKey, ex, restSeconds);
                  }
                }}
              />
              <button type="button" aria-label="One rep more" onClick={() => bump("reps", 1)}>
                +
              </button>
            </div>
          </label>
        </div>
        <p className="sm t3">Kg = {ex.loadHint}. Step {ex.step ? `${fmt(ex.step)} kg` : "—"}.</p>
        <div className="btn-row">
          {logged ? (
            <button type="button" className="btn ghost small" onClick={() => remove(slotKey, editing.setIndex)}>
              Remove
            </button>
          ) : null}
          <button type="button" className="btn small" onClick={() => commitEditor(slotKey, ex, restSeconds)}>
            <Icon name="check" size={16} stroke={2.6} /> Log set
          </button>
        </div>
      </div>
    );
  };

  const renderSets = (slotKey: string, ex: ActiveExercise, plannedSets: number, restSeconds: number, testMode: boolean) => {
    const logged = bySlot.get(slotKey) ?? [];
    const maxIdx = logged.reduce((m, s) => Math.max(m, s.setIndex), 0);
    const rows = Math.max(plannedSets, maxIdx) + (extraRows[slotKey] ?? 0);
    const firstOpen = Array.from({ length: rows }, (_, i) => i + 1).find((i) => !logged.some((s) => s.setIndex === i)) ?? null;
    const canOneTap = ex.loadMode === "none" || ex.plannedWeight !== null;
    const curPlannedReps = firstOpen ? ex.plannedReps[firstOpen - 1] ?? ex.plannedReps.at(-1) ?? null : null;

    return (
      <>
        <div className="sets">
          {Array.from({ length: rows }, (_, i) => {
            const idx = i + 1;
            const l = logged.find((s) => s.setIndex === idx);
            const planned = ex.plannedReps[i] ?? ex.plannedReps.at(-1) ?? null;
            const cls = l ? "" : idx === firstOpen ? "cur" : "todo";
            const weight = l ? l.weight : ex.plannedWeight;
            const devW = l && ex.plannedWeight !== null && l.weight !== ex.plannedWeight;
            const devR = l && planned !== null && l.reps !== planned;
            const label = l
              ? `Set ${idx}: logged ${loadLabel(ex, l.weight)} kg for ${l.reps} reps. Tap to edit.`
              : idx === firstOpen && canOneTap && !testMode
                ? `Set ${idx}: log ${loadLabel(ex, ex.plannedWeight)} kg for ${planned ?? "—"} reps as planned.`
                : `Set ${idx}: enter weight and reps.`;
            return (
              <button
                key={idx}
                type="button"
                className={`set ${cls}`}
                aria-label={label}
                onClick={() => {
                  if (!l && idx === firstOpen && canOneTap && !testMode && planned !== null) {
                    save(slotKey, ex, idx, ex.plannedWeight, planned, restSeconds);
                  } else openEditor(slotKey, ex, idx);
                }}
              >
                <span className="sn">Set {idx}</span>
                <span>
                  <span className="lab">{ex.loadMode === "added" ? "+KG" : "KG"}</span>
                  <span className={devW ? "dev" : undefined}>{loadLabel(ex, weight)}</span>
                </span>
                <span>
                  <span className="lab">REPS</span>
                  <span className={devR ? "dev" : undefined}>{l ? l.reps : planned ?? "—"}</span>
                </span>
                <span className="ok" aria-hidden="true">
                  {l || idx === firstOpen ? <Icon name={l ? "check" : canOneTap && !testMode ? "check" : "edit"} size={18} stroke={2.6} /> : null}
                </span>
              </button>
            );
          })}
        </div>
        {renderEditor(slotKey, ex, restSeconds)}
        {firstOpen !== null && canOneTap && !testMode && curPlannedReps !== null && !editing ? (
          <div className="btn-row" role="group" aria-label={`Log set ${firstOpen}`}>
            <button type="button" className="btn ghost small" onClick={() => save(slotKey, ex, firstOpen, ex.plannedWeight, Math.max(0, curPlannedReps - 1), restSeconds)}>
              − rep
            </button>
            <button type="button" className="btn small" style={{ flex: 2 }} onClick={() => save(slotKey, ex, firstOpen, ex.plannedWeight, curPlannedReps, restSeconds)}>
              Done as planned
            </button>
            <button type="button" className="btn ghost small" onClick={() => save(slotKey, ex, firstOpen, ex.plannedWeight, curPlannedReps + 1, restSeconds)}>
              + rep
            </button>
          </div>
        ) : null}
        <button
          type="button"
          className="swap"
          onClick={() => setExtraRows((r) => ({ ...r, [slotKey]: (r[slotKey] ?? 0) + 1 }))}
          disabled={rows >= 20}
        >
          <Icon name="plus" size={14} /> Add a set
        </button>
      </>
    );
  };

  const restLeft = rest ? Math.max(0, (rest.end - nowMs) / 1000) : 0;

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="row">
        <span className="lbl" aria-live="polite">
          {plannedCount ? `${doneCount} of ${plannedCount} sets logged` : `${plural(doneCount, "set")} logged`}
        </span>
        {pending ? <span className="sm t3">Saving…</span> : null}
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {props.slots.map((slot) => {
        const ex = active(slot);
        const isSub = !!subOn[slot.slot];
        const testMode = slot.status === "baseline_test" || (isSub ? false : slot.status === "choose_load");
        const change = slot.change && slot.change.from !== null && slot.change.to !== null ? slot.change.to - slot.change.from : null;
        const loggedHere = (bySlot.get(slot.slot) ?? []).length;
        return (
          <section key={slot.slot} className={`card ex${isSub ? " warn-edge" : ""}`} aria-labelledby={`ex-${slot.slot}`} data-slot={slot.slot}>
            <div className="exh">
              <span className="exn">{slot.slot.padStart(2, "0")}</span>
              <div>
                <h2 id={`ex-${slot.slot}`} className="exname">
                  {ex.name}
                </h2>
                <div className="extgt">
                  {slot.status === "baseline_test"
                    ? "Baseline test · sets of 8"
                    : `${ex.loadMode === "none" ? "Bodyweight" : ex.plannedWeight === null ? "Your pick" : `${loadLabel(ex, ex.plannedWeight)} kg`} · ${slot.sets} × ${slot.reps[0] === slot.reps[1] ? slot.reps[0] : `${slot.reps[0]}–${slot.reps[1]}`}`}
                  {slot.rir !== "—" ? ` · RIR ${slot.rir}` : ""} · rest {slot.rest}
                  {slot.exercise.perSide ? " · each side" : ""}
                </div>
              </div>
              {change && !isSub ? (
                <span className={`chip ${change > 0 ? "up" : "down"}`}>
                  {change > 0 ? "+" : "−"}
                  {fmt(Math.abs(change))} kg
                </span>
              ) : slot.optional ? (
                <span className="chip">Optional</span>
              ) : null}
            </div>
            {!isSub ? (
              <div className="why">
                {slot.status === "working" || slot.status === "percent" ? <b>Why: </b> : null}
                {slot.why}
                {slot.hint ? <span className="t3"> {slot.hint}</span> : null}
              </div>
            ) : (
              <div className="why substack">
                Swapped in for {slot.exercise.name}. It is logged as its own lift; {slot.exercise.name.toLowerCase()} repeats next time.
              </div>
            )}
            {!isSub && slot.plates && slot.weight !== null ? <Plates plates={slot.plates} barKg={props.barKg} totalKg={slot.weight} /> : null}
            {props.bestSlot === slot.slot && !isSub ? (
              <span className="best">
                <Icon name="trophy" size={14} stroke={2} /> Best-set attempt: last set, every clean rep
              </span>
            ) : null}
            <details className="more">
              <summary>Setup{slot.exercise.station ? ` · ${slot.exercise.station}` : ""}</summary>
              <p className="cue">{isSub && slot.substitute ? slot.substitute.exercise.cue : slot.exercise.cue}</p>
              {slot.note ? <p className="cue t3">{slot.note}</p> : null}
            </details>
            {renderSets(slot.slot, ex, slot.sets, slot.restSeconds, testMode)}
            {slot.substitute ? (
              <button
                type="button"
                className="swap"
                aria-pressed={isSub}
                disabled={loggedHere > 0}
                title={loggedHere > 0 ? "Remove the logged sets to switch" : undefined}
                onClick={() => {
                  setEditing(null);
                  setSubOn((s) => ({ ...s, [slot.slot]: !isSub }));
                }}
              >
                <Icon name="swap" size={14} />
                {isSub
                  ? `Back to ${slot.exercise.name}`
                  : `Station taken? ${slot.substitute.exercise.name}${slot.substitute.weight !== null ? ` · ${fmt(slot.substitute.weight)} kg` : ""}`}
              </button>
            ) : null}
          </section>
        );
      })}

      {extras.map(({ slot, option }) => {
        const ex: ActiveExercise = {
          key: option.key,
          name: option.name,
          track: option.track,
          substituteFor: null,
          loadMode: option.equipment === "none" ? "none" : option.equipment === "belt" ? "added" : "external",
          loadHint: option.loadHint,
          step: 2.5,
          plannedWeight: null,
          plannedReps: [8],
        };
        return (
          <section key={slot} className="card ex" aria-labelledby={`ex-${slot}`} data-slot={slot}>
            <div className="exh">
              <span className="exn">+</span>
              <div>
                <h2 id={`ex-${slot}`} className="exname">
                  {option.name}
                </h2>
                <div className="extgt">Added exercise · enter each set</div>
              </div>
            </div>
            {renderSets(slot, ex, 1, 90, true)}
          </section>
        );
      })}

      <section className="card" aria-label="Extra exercises">
        <label className="field">
          <span>Add an exercise</span>
          <select className="select" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Choose…</option>
            {props.extraOptions.map((o) => (
              <option key={o.key} value={o.key}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn ghost small"
          disabled={!pick || extras.length >= 9}
          onClick={() => {
            const option = props.extraOptions.find((o) => o.key === pick);
            if (!option) return;
            const used = new Set([...extras.map((e) => e.slot), ...sets.map((s) => s.slot)]);
            const slot = Array.from({ length: 9 }, (_, i) => `x${i + 1}`).find((x) => !used.has(x));
            if (!slot) return;
            setExtras((list) => [...list, { slot, option }]);
            setPick("");
          }}
        >
          <Icon name="plus" size={16} /> Add
        </button>
      </section>

      {sessionId && sets.length > 0 ? (
        <form action={finishSessionAction} className="card" aria-label="Finish session">
          <input type="hidden" name="sessionId" value={sessionId} />
          <label className="field">
            <span>Session note (optional)</span>
            <textarea className="textarea" name="note" maxLength={2000} placeholder="How it felt, anything to remember" style={{ minHeight: 70 }} />
          </label>
          <button type="submit" className="btn ghost" disabled={pending}>
            Finish session
          </button>
        </form>
      ) : null}

      {rest ? (
        <div className="toast" role="timer" aria-live="off" style={{ background: "var(--surface2)", color: "var(--ink)", border: "2px solid var(--warn)" }}>
          <div className="rest grow">
            <Icon name="timer" size={16} />
            <span>{restLeft > 0 ? "Rest" : "Go"}</span>
            <div className="meter good">
              <i style={{ width: `${Math.min(100, ((rest.total - restLeft) / rest.total) * 100)}%` }} />
            </div>
            <span>
              {mmss(restLeft)} / {mmss(rest.total)}
            </span>
          </div>
          <button type="button" onClick={() => setRest(null)} aria-label="Dismiss rest timer" style={{ color: "var(--ink)" }}>
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}
