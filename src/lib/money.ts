/**
 * Money helpers. All authoritative amounts are integer paise (₹1 = 100 paise).
 * Conversion to/from rupee strings is done with string arithmetic so that no
 * floating-point value is ever used to compute a stored amount.
 */

/** ₹100 crore — generous upper bound that keeps every sum far below Number.MAX_SAFE_INTEGER. */
export const MAX_AMOUNT_PAISE = 100_00_00_000_00;

const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

/** Returns true when `input` is a valid positive rupee amount such as "150", "150.5" or "1,500.50". */
export function isValidRupeeInput(input: string): boolean {
  const paise = parseRupeesToPaise(input);
  return paise !== null && paise > 0;
}

/**
 * Parses a user-entered rupee string to integer paise.
 * "150.50" → 15050, "1,234" → 123400. Returns null for malformed input,
 * negative numbers, more than two decimal places, or values above the maximum.
 */
export function parseRupeesToPaise(input: string): number | null {
  const cleaned = input.trim().replace(/[₹,\s]/g, "");
  if (!AMOUNT_PATTERN.test(cleaned)) return null;
  const [whole, fraction = ""] = cleaned.split(".");
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(paise) || paise > MAX_AMOUNT_PAISE) return null;
  return paise;
}

/** Like parseRupeesToPaise but accepts zero and a leading minus sign (opening balances, target balances). */
export function parseSignedRupeesToPaise(input: string): number | null {
  const trimmed = input.trim();
  const negative = trimmed.startsWith("-");
  const paise = parseRupeesToPaise(negative ? trimmed.slice(1) : trimmed);
  if (paise === null) return null;
  return negative ? -paise : paise;
}

/** Converts paise to a plain rupee string suitable for an input field: 15050 → "150.50". */
export function paiseToRupeeString(paise: number): string {
  assertPaise(paise);
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

const groupingFormatter = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/**
 * Formats paise as Indian Rupees with Indian digit grouping: 2400000 → "₹24,000.00".
 * Negative values render as "-₹1,250.00".
 */
export function formatINR(paise: number, options: { signed?: boolean } = {}): string {
  assertPaise(paise);
  const abs = Math.abs(paise);
  const rupees = groupingFormatter.format(BigInt(Math.trunc(abs / 100)));
  const fraction = String(abs % 100).padStart(2, "0");
  const sign = paise < 0 ? "-" : options.signed && paise > 0 ? "+" : "";
  return `${sign}₹${rupees}.${fraction}`;
}

/** Compact form for chart axes: 150000000 → "₹15L", 2500000 → "₹25K". */
export function formatINRCompact(paise: number): string {
  const rupees = paise / 100; // display-only
  const abs = Math.abs(rupees);
  const sign = rupees < 0 ? "-" : "";
  if (abs >= 1_00_00_000) return `${sign}₹${trim(abs / 1_00_00_000)}Cr`;
  if (abs >= 1_00_000) return `${sign}₹${trim(abs / 1_00_000)}L`;
  if (abs >= 1_000) return `${sign}₹${trim(abs / 1_000)}K`;
  return `${sign}₹${trim(abs)}`;
}

function trim(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}

/** Exact integer sum of paise values. */
export function sumPaise(values: readonly number[]): number {
  let total = 0;
  for (const value of values) {
    assertPaise(value);
    total += value;
  }
  if (!Number.isSafeInteger(total)) throw new RangeError("Sum exceeds the safe integer range.");
  return total;
}

function assertPaise(value: number) {
  if (!Number.isSafeInteger(value)) throw new TypeError(`Expected integer paise, received ${value}`);
}

/**
 * Savings rate as a percentage with one decimal place, or null when income is zero
 * (a rate is meaningless without income).
 */
export function savingsRate(netSavingsPaise: number, incomePaise: number): number | null {
  if (incomePaise <= 0) return null;
  return Math.round((netSavingsPaise / incomePaise) * 1000) / 10;
}
