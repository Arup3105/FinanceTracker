import { describe, expect, it } from "vitest";
import {
  formatDateTime,
  getPeriodRange,
  getPreviousRange,
  listBuckets,
  parseLocalDateTime,
  toLocalDateTimeInput,
  truncate,
} from "@/lib/dates";

const IST = "Asia/Kolkata";
const utc = (iso: string) => new Date(iso);

describe("local date-time parsing", () => {
  it("interprets wall-clock input in Asia/Kolkata (UTC+5:30)", () => {
    expect(parseLocalDateTime("2026-10-25T14:30", IST)?.toISOString()).toBe("2026-10-25T09:00:00.000Z");
    expect(parseLocalDateTime("2026-01-01T00:00", IST)?.toISOString()).toBe("2025-12-31T18:30:00.000Z");
  });

  it("rejects malformed or impossible dates", () => {
    for (const bad of ["2026-02-30T10:00", "2026-13-01T00:00", "2026-01-01 10:00", "garbage", "2026-01-01T24:00"]) {
      expect(parseLocalDateTime(bad, IST), bad).toBeNull();
    }
  });

  it("round-trips to the datetime-local input format", () => {
    const instant = utc("2026-10-25T09:00:00Z");
    expect(toLocalDateTimeInput(instant, IST)).toBe("2026-10-25T14:30");
    expect(formatDateTime(instant, IST)).toBe("25 Oct 2026, 2:30 PM");
  });
});

describe("period boundaries in Asia/Kolkata (Test 14)", () => {
  const now = utc("2026-10-25T09:00:00Z"); // 25 Oct 2026, 14:30 IST (a Sunday)

  it("today starts at local midnight", () => {
    const range = getPeriodRange("today", IST, now);
    expect(range.start.toISOString()).toBe("2026-10-24T18:30:00.000Z");
    expect(range.end.toISOString()).toBe("2026-10-25T18:30:00.000Z");
  });

  it("weeks start on Monday", () => {
    const range = getPeriodRange("week", IST, now);
    expect(range.start.toISOString()).toBe("2026-10-18T18:30:00.000Z"); // Mon 19 Oct 00:00 IST
    expect(range.end.toISOString()).toBe("2026-10-25T18:30:00.000Z");
  });

  it("month, quarter and year use local calendar boundaries", () => {
    expect(getPeriodRange("month", IST, now).start.toISOString()).toBe("2026-09-30T18:30:00.000Z");
    expect(getPeriodRange("month", IST, now).end.toISOString()).toBe("2026-10-31T18:30:00.000Z");
    expect(getPeriodRange("quarter", IST, now).start.toISOString()).toBe("2026-09-30T18:30:00.000Z");
    expect(getPeriodRange("quarter", IST, now).end.toISOString()).toBe("2026-12-31T18:30:00.000Z");
    expect(getPeriodRange("year", IST, now).start.toISOString()).toBe("2025-12-31T18:30:00.000Z");
    expect(getPeriodRange("year", IST, now).end.toISOString()).toBe("2026-12-31T18:30:00.000Z");
  });

  it("a transaction at 11:59 PM IST on month-end belongs to that month, 12:00 AM to the next", () => {
    const oct = getPeriodRange("month", IST, now);
    const lateOct31 = parseLocalDateTime("2026-10-31T23:59", IST)!;
    const earlyNov1 = parseLocalDateTime("2026-11-01T00:00", IST)!;
    expect(lateOct31 >= oct.start && lateOct31 < oct.end).toBe(true);
    expect(earlyNov1 >= oct.start && earlyNov1 < oct.end).toBe(false);
    // In UTC both instants are still on 31 Oct — naive UTC grouping would misplace the second one.
    expect(earlyNov1.toISOString().startsWith("2026-10-31")).toBe(true);
  });

  it("quarter-end and year-end boundaries", () => {
    const q4 = getPeriodRange("quarter", IST, now);
    expect(parseLocalDateTime("2026-09-30T23:59", IST)! < q4.start).toBe(true);
    expect(parseLocalDateTime("2026-10-01T00:00", IST)!.getTime()).toBe(q4.start.getTime());
    const year = getPeriodRange("year", IST, now);
    expect(parseLocalDateTime("2026-12-31T23:59", IST)! < year.end).toBe(true);
    expect(parseLocalDateTime("2027-01-01T00:00", IST)!.getTime()).toBe(year.end.getTime());
  });

  it("custom ranges include the whole 'to' day", () => {
    const range = getPeriodRange("custom", IST, now, { from: "2026-10-01", to: "2026-10-10" });
    expect(range.start.toISOString()).toBe("2026-09-30T18:30:00.000Z");
    expect(range.end.toISOString()).toBe("2026-10-10T18:30:00.000Z");
    expect(range.bucket).toBe("day");
  });

  it("invalid custom ranges fall back to this month", () => {
    const range = getPeriodRange("custom", IST, now, { from: "2026-10-10", to: "2026-10-01" });
    expect(range.period).toBe("month");
  });

  it("previous period is the equivalent preceding period", () => {
    const prev = getPreviousRange(getPeriodRange("month", IST, now), IST);
    expect(prev.start.toISOString()).toBe("2026-08-31T18:30:00.000Z");
    expect(prev.end.toISOString()).toBe("2026-09-30T18:30:00.000Z");
    const custom = getPeriodRange("custom", IST, now, { from: "2026-10-01", to: "2026-10-10" });
    const prevCustom = getPreviousRange(custom, IST);
    expect(prevCustom.start.toISOString()).toBe("2026-09-20T18:30:00.000Z");
    expect(prevCustom.end.getTime()).toBe(custom.start.getTime());
  });
});

describe("chart buckets", () => {
  it("lists every day of the month in local time", () => {
    const range = getPeriodRange("month", IST, utc("2026-02-10T00:00:00Z"));
    const buckets = listBuckets(range, "day", IST);
    expect(buckets).toHaveLength(28);
    expect(buckets[0].start.toISOString()).toBe("2026-01-31T18:30:00.000Z");
    expect(buckets[0].label).toBe("1 Feb");
  });

  it("truncates to local week/month starts", () => {
    const instant = parseLocalDateTime("2026-10-25T00:15", IST)!;
    expect(truncate(instant, "day", IST).toISOString()).toBe("2026-10-24T18:30:00.000Z");
    expect(truncate(instant, "week", IST).toISOString()).toBe("2026-10-18T18:30:00.000Z");
    expect(truncate(instant, "month", IST).toISOString()).toBe("2026-09-30T18:30:00.000Z");
  });
});
