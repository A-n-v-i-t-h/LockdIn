// Calendar maths for one athlete who lives in India. IST has no daylight saving,
// so a fixed +05:30 offset converts local wall time to instants exactly.
// Dates are ISO strings ("2026-09-21"); instants are Date objects or ISO strings.

export const TIME_ZONE = "Asia/Kolkata";
export const TZ_OFFSET = "+05:30";
const OFFSET_MINUTES = 330;

const DAY_MS = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DOW_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function assertDate(value: string): void {
  if (!isIsoDate(value)) throw new RangeError(`Not an ISO date: ${value}`);
}

// The process start, shared by every copy of this module (a server can load a
// route's bundle much later than the first page's).
const processStart = Math.round(performance.timeOrigin);

/**
 * The instant "now". Tests and demos can set LOCKDIN_FAKE_NOW (never in
 * production): the clock starts there when the process starts and keeps
 * ticking, so records written one after another still get increasing times.
 */
export function now(): Date {
  const fake = process.env.LOCKDIN_FAKE_NOW;
  if (fake && process.env.VERCEL_ENV !== "production") {
    const d = new Date(fake);
    if (!Number.isNaN(d.getTime())) return new Date(d.getTime() + (Date.now() - processStart));
  }
  return new Date();
}

/** Local (IST) calendar date of an instant. */
export function localDate(instant: Date = now()): string {
  const shifted = new Date(instant.getTime() + OFFSET_MINUTES * 60_000);
  return shifted.toISOString().slice(0, 10);
}

/** Local (IST) wall-clock "HH:MM" of an instant. */
export function localTime(instant: Date = now()): string {
  const shifted = new Date(instant.getTime() + OFFSET_MINUTES * 60_000);
  return shifted.toISOString().slice(11, 16);
}

/** Local hour 0–23. */
export function localHour(instant: Date = now()): number {
  return Number(localTime(instant).slice(0, 2));
}

/** The instant for a local date and "HH:MM" wall time. */
export function toInstant(date: string, hhmm: string): Date {
  assertDate(date);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm)) throw new RangeError(`Not a time: ${hhmm}`);
  return new Date(`${date}T${hhmm}:00${TZ_OFFSET}`);
}

export function addDays(date: string, days: number): string {
  assertDate(date);
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function diffDays(to: string, from: string): number {
  assertDate(to);
  assertDate(from);
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function weekday(date: string): number {
  assertDate(date);
  const js = new Date(`${date}T00:00:00Z`).getUTCDay();
  return js === 0 ? 7 : js;
}

/** Monday of the week containing `date`. */
export function weekStart(date: string): string {
  return addDays(date, 1 - weekday(date));
}

export function sameWeek(a: string, b: string): boolean {
  return weekStart(a) === weekStart(b);
}

/** Inclusive list of dates. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  const n = diffDays(to, from);
  for (let i = 0; i <= n; i++) out.push(addDays(from, i));
  return out;
}

export function monthStart(date: string): string {
  assertDate(date);
  return `${date.slice(0, 7)}-01`;
}

export function daysInMonth(date: string): number {
  const [y, m] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addMonths(date: string, months: number): string {
  const [y, m] = date.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return d.toISOString().slice(0, 10);
}

/** True for the first Monday of a month (the day the monthly audit runs). */
export function isFirstMondayOfMonth(date: string): boolean {
  return weekday(date) === 1 && Number(date.slice(8, 10)) <= 7;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** "Thu 29 Oct" */
export function fmtShort(date: string): string {
  assertDate(date);
  return `${DOW[weekday(date) - 1]} ${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;
}

/** "29 Oct" */
export function fmtDayMonth(date: string): string {
  assertDate(date);
  return `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;
}

/** "Thursday 29 October 2026" */
export function fmtLong(date: string): string {
  assertDate(date);
  return `${DOW_LONG[weekday(date) - 1]} ${Number(date.slice(8, 10))} ${MONTHS_LONG[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;
}

/** "October" */
export function fmtMonth(date: string): string {
  return MONTHS_LONG[Number(date.slice(5, 7)) - 1];
}

export function fmtWeekdayShort(isoWeekday: number): string {
  return DOW[isoWeekday - 1];
}

/** "18:30" → "6:30 PM" */
export function fmt12h(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** 450 → "7 h 30 m" */
export function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes - h * 60);
  if (h === 0) return `${m} m`;
  return m === 0 ? `${h} h` : `${h} h ${m} m`;
}

/** Relative label for a date compared with today: "Today", "Tomorrow", "Yesterday", else short date. */
export function fmtRelative(date: string, today: string): string {
  const d = diffDays(date, today);
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d === -1) return "Yesterday";
  return fmtShort(date);
}

export type DayPart = "morning" | "day" | "evening" | "night";

/** Morning 04:00–11:59, day 12:00–16:59, evening 17:00–20:59, night 21:00–03:59. */
export function dayPart(instant: Date = now()): DayPart {
  const h = localHour(instant);
  if (h >= 4 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "day";
  if (h >= 17 && h < 21) return "evening";
  return "night";
}

/** The date a "night" entry belongs to: before 04:00 it still counts as yesterday. */
export function logicalDate(instant: Date = now()): string {
  const d = localDate(instant);
  return localHour(instant) < 4 ? addDays(d, -1) : d;
}
