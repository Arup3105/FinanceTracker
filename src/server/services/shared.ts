import "server-only";
import { parseLocalDateTime } from "@/lib/dates";
import { parseRupeesToPaise, parseSignedRupeesToPaise } from "@/lib/money";
import { badRequest } from "@/server/errors";

const EARLIEST = new Date("2000-01-01T00:00:00Z");
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * Converts a wall-clock "YYYY-MM-DDTHH:mm" string in the user's timezone to a UTC Date.
 * Future dates are rejected so that "current balance" always reflects money that has moved.
 */
export function resolveEffectiveAt(local: string, timeZone: string, field = "effectiveAt", now = new Date()): Date {
  const date = parseLocalDateTime(local, timeZone);
  if (!date) throw badRequest("Enter a valid date and time.", { [field]: ["Enter a valid date and time."] });
  if (date < EARLIEST) throw badRequest("Dates before 2000 are not supported.", { [field]: ["Date is too far in the past."] });
  if (date.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) {
    throw badRequest("The date cannot be in the future.", { [field]: ["The date cannot be in the future."] });
  }
  return date;
}

export function toPaise(amount: string, field = "amount"): number {
  const paise = parseRupeesToPaise(amount);
  if (paise === null || paise <= 0) throw badRequest("Enter a valid amount.", { [field]: ["Enter a valid amount."] });
  return paise;
}

export function toSignedPaise(amount: string, field = "amount"): number {
  const paise = parseSignedRupeesToPaise(amount);
  if (paise === null) throw badRequest("Enter a valid amount.", { [field]: ["Enter a valid amount."] });
  return paise;
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
