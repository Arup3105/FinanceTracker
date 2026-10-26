import { tz, TZDate } from "@date-fns/tz";
import {
  addDays,
  addHours,
  addMonths,
  addQuarters,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  format,
  startOfDay,
  startOfHour,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
} from "date-fns";
import type { Period } from "@/lib/finance/constants";

/**
 * Date handling convention:
 * - Every timestamp is stored in MongoDB as a UTC `Date`.
 * - Period boundaries are computed in the user's configured IANA timezone
 *   (default Asia/Kolkata) and are half-open: [start, end).
 * - Form inputs exchange wall-clock strings ("YYYY-MM-DDTHH:mm") that are
 *   interpreted in the user's timezone, never the browser's.
 */

export type BucketUnit = "hour" | "day" | "week" | "month";

export interface DateRange {
  start: Date;
  /** Exclusive upper bound. */
  end: Date;
}

export interface PeriodRange extends DateRange {
  period: Period;
  bucket: BucketUnit;
  label: string;
}

const LOCAL_DATETIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Parses "2026-10-25T14:30" as a wall-clock time in `timeZone`. Returns null when malformed or non-existent. */
export function parseLocalDateTime(value: string, timeZone: string): Date | null {
  const match = LOCAL_DATETIME.exec(value);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const date = new TZDate(y, mo - 1, d, h, mi, timeZone);
  // Reject rollovers such as 31 February.
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return new Date(date.getTime());
}

/** Parses "2026-10-25" as the start of that day in `timeZone`. */
export function parseLocalDate(value: string, timeZone: string): Date | null {
  const match = LOCAL_DATE.exec(value);
  if (!match) return null;
  return parseLocalDateTime(`${value}T00:00`, timeZone);
}

/** Formats a UTC instant as the "YYYY-MM-DDTHH:mm" value used by datetime-local inputs. */
export function toLocalDateTimeInput(date: Date, timeZone: string): string {
  return format(new TZDate(date, timeZone), "yyyy-MM-dd'T'HH:mm");
}

export function toLocalDateInput(date: Date, timeZone: string): string {
  return format(new TZDate(date, timeZone), "yyyy-MM-dd");
}

/** "25 Oct 2026, 2:30 PM" in the given timezone. */
export function formatDateTime(date: Date, timeZone: string): string {
  return format(new TZDate(date, timeZone), "d MMM yyyy, h:mm a");
}

export function formatDate(date: Date, timeZone: string): string {
  return format(new TZDate(date, timeZone), "d MMM yyyy");
}

/** Resolves a reporting period to a half-open UTC range computed in `timeZone`. */
export function getPeriodRange(
  period: Period,
  timeZone: string,
  now: Date = new Date(),
  custom?: { from?: string; to?: string },
): PeriodRange {
  const ctx = { in: tz(timeZone) };
  switch (period) {
    case "today": {
      const start = startOfDay(now, ctx);
      return build(period, start, addDays(start, 1, ctx), "hour", format(start, "d MMM yyyy", ctx));
    }
    case "week": {
      const start = startOfWeek(now, { ...ctx, weekStartsOn: 1 });
      const end = addWeeks(start, 1, ctx);
      return build(period, start, end, "day", rangeLabel(start, end, timeZone));
    }
    case "month": {
      const start = startOfMonth(now, ctx);
      return build(period, start, addMonths(start, 1, ctx), "day", format(start, "MMMM yyyy", ctx));
    }
    case "quarter": {
      const start = startOfQuarter(now, ctx);
      const end = addQuarters(start, 1, ctx);
      return build(period, start, end, "week", `Q${Math.floor(start.getMonth() / 3) + 1} ${start.getFullYear()}`);
    }
    case "year": {
      const start = startOfYear(now, ctx);
      return build(period, start, addYears(start, 1, ctx), "month", format(start, "yyyy", ctx));
    }
    case "custom": {
      const from = custom?.from ? parseLocalDate(custom.from, timeZone) : null;
      const to = custom?.to ? parseLocalDate(custom.to, timeZone) : null;
      if (!from || !to || to < from) {
        // Fall back to the current month when the custom range is missing or invalid.
        return getPeriodRange("month", timeZone, now);
      }
      const end = addDays(to, 1, ctx); // "to" is inclusive for the user
      return build(period, startOfDay(from, ctx), startOfDay(end, ctx), bucketForSpan(from, end), rangeLabel(from, end, timeZone));
    }
  }
}

function build(period: Period, start: Date, end: Date, bucket: BucketUnit, label: string): PeriodRange {
  return { period, start: new Date(start.getTime()), end: new Date(end.getTime()), bucket, label };
}

function bucketForSpan(start: Date, end: Date): BucketUnit {
  const days = differenceInCalendarDays(end, start);
  if (days <= 2) return "hour";
  if (days <= 62) return "day";
  if (days <= 190) return "week";
  return "month";
}

function rangeLabel(start: Date, endExclusive: Date, timeZone: string): string {
  const lastDay = new Date(endExclusive.getTime() - 1);
  return `${formatDate(start, timeZone)} – ${formatDate(lastDay, timeZone)}`;
}

/** The equivalent period immediately before `range` (previous month, previous quarter, …). */
export function getPreviousRange(range: PeriodRange, timeZone: string): DateRange {
  const ctx = { in: tz(timeZone) };
  switch (range.period) {
    case "today":
      return { start: toDate(addDays(range.start, -1, ctx)), end: range.start };
    case "week":
      return { start: toDate(addWeeks(range.start, -1, ctx)), end: range.start };
    case "month":
      return { start: toDate(addMonths(range.start, -1, ctx)), end: range.start };
    case "quarter":
      return { start: toDate(addQuarters(range.start, -1, ctx)), end: range.start };
    case "year":
      return { start: toDate(addYears(range.start, -1, ctx)), end: range.start };
    case "custom": {
      const days = differenceInCalendarDays(range.end, range.start, ctx);
      return { start: toDate(addDays(range.start, -days, ctx)), end: range.start };
    }
  }
}

function toDate(value: Date): Date {
  return new Date(value.getTime());
}

export interface Bucket {
  /** UTC instant at the start of the bucket, matching MongoDB $dateTrunc output. */
  start: Date;
  label: string;
}

/** Every bucket in [range.start, range.end), so charts show zero-value gaps. */
export function listBuckets(range: DateRange, unit: BucketUnit, timeZone: string): Bucket[] {
  const ctx = { in: tz(timeZone) };
  const buckets: Bucket[] = [];
  let cursor: Date = truncate(range.start, unit, timeZone);
  // Hard cap protects against pathological ranges.
  while (cursor < range.end && buckets.length < 400) {
    buckets.push({ start: toDate(cursor), label: bucketLabel(cursor, unit, timeZone) });
    cursor =
      unit === "hour"
        ? addHours(cursor, 1, ctx)
        : unit === "day"
          ? addDays(cursor, 1, ctx)
          : unit === "week"
            ? addWeeks(cursor, 1, ctx)
            : addMonths(cursor, 1, ctx);
  }
  return buckets;
}

export function truncate(date: Date, unit: BucketUnit, timeZone: string): Date {
  const ctx = { in: tz(timeZone) };
  const value =
    unit === "hour"
      ? startOfHour(date, ctx)
      : unit === "day"
        ? startOfDay(date, ctx)
        : unit === "week"
          ? startOfWeek(date, { ...ctx, weekStartsOn: 1 })
          : startOfMonth(date, ctx);
  return toDate(value);
}

function bucketLabel(date: Date, unit: BucketUnit, timeZone: string): string {
  const local = new TZDate(date, timeZone);
  switch (unit) {
    case "hour":
      return format(local, "h a");
    case "day":
      return format(local, "d MMM");
    case "week":
      return `Wk of ${format(local, "d MMM")}`;
    case "month":
      return format(local, "MMM yyyy");
  }
}
