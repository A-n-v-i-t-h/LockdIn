import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  dateRange,
  dayPart,
  diffDays,
  fmt12h,
  fmtDuration,
  fmtLong,
  fmtRelative,
  fmtShort,
  isFirstMondayOfMonth,
  isIsoDate,
  localDate,
  localTime,
  logicalDate,
  toInstant,
  weekday,
  weekStart,
} from "@/lib/time";

describe("IST calendar", () => {
  it("maps instants to the local date across midnight", () => {
    expect(localDate(new Date("2026-09-20T18:29:59Z"))).toBe("2026-09-20");
    expect(localDate(new Date("2026-09-20T18:30:00Z"))).toBe("2026-09-21");
    expect(localTime(new Date("2026-09-21T01:30:00Z"))).toBe("07:00");
  });

  it("converts local wall time to instants with the fixed offset", () => {
    expect(toInstant("2026-09-21", "07:00").toISOString()).toBe("2026-09-21T01:30:00.000Z");
    expect(toInstant("2026-09-20", "23:30").toISOString()).toBe("2026-09-20T18:00:00.000Z");
    expect(() => toInstant("2026-09-21", "24:00")).toThrow();
    expect(() => toInstant("2026-02-30", "07:00")).toThrow();
  });

  it("does date arithmetic without drift", () => {
    expect(addDays("2026-09-28", 7)).toBe("2026-10-05");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(diffDays("2026-10-05", "2026-09-07")).toBe(28);
    expect(diffDays("2026-09-07", "2026-10-05")).toBe(-28);
    expect(dateRange("2026-09-29", "2026-10-02")).toEqual(["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]);
    expect(addMonths("2026-11-15", 2)).toBe("2027-01-01");
  });

  it("knows weekdays and week starts", () => {
    expect(weekday("2026-09-07")).toBe(1);
    expect(weekday("2026-09-13")).toBe(7);
    expect(weekStart("2026-09-13")).toBe("2026-09-07");
    expect(weekStart("2026-09-14")).toBe("2026-09-14");
    expect(isFirstMondayOfMonth("2026-11-02")).toBe(true);
    expect(isFirstMondayOfMonth("2026-10-12")).toBe(false);
    expect(isFirstMondayOfMonth("2026-10-06")).toBe(false);
  });

  it("validates ISO dates strictly", () => {
    expect(isIsoDate("2026-09-21")).toBe(true);
    expect(isIsoDate("2026-9-21")).toBe(false);
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate(20260921)).toBe(false);
  });

  it("formats for people", () => {
    expect(fmtShort("2026-10-29")).toBe("Thu 29 Oct");
    expect(fmtLong("2026-10-29")).toBe("Thursday 29 October 2026");
    expect(fmt12h("18:30")).toBe("6:30 PM");
    expect(fmt12h("00:05")).toBe("12:05 AM");
    expect(fmtDuration(450)).toBe("7 h 30 m");
    expect(fmtDuration(420)).toBe("7 h");
    expect(fmtDuration(45)).toBe("45 m");
    expect(fmtRelative("2026-10-30", "2026-10-29")).toBe("Tomorrow");
    expect(fmtRelative("2026-11-02", "2026-10-29")).toBe("Mon 2 Nov");
  });

  it("splits the day into parts and treats early hours as the previous night", () => {
    expect(dayPart(new Date("2026-09-21T01:30:00Z"))).toBe("morning"); // 07:00
    expect(dayPart(new Date("2026-09-21T08:30:00Z"))).toBe("day"); // 14:00
    expect(dayPart(new Date("2026-09-21T13:00:00Z"))).toBe("evening"); // 18:30
    expect(dayPart(new Date("2026-09-21T16:30:00Z"))).toBe("night"); // 22:00
    expect(logicalDate(new Date("2026-09-21T19:00:00Z"))).toBe("2026-09-21"); // 00:30 on the 22nd
    expect(logicalDate(new Date("2026-09-21T23:00:00Z"))).toBe("2026-09-22"); // 04:30
  });
});
