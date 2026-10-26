import { describe, expect, it } from "vitest";
import {
  formatINR,
  formatINRCompact,
  paiseToRupeeString,
  parseRupeesToPaise,
  parseSignedRupeesToPaise,
  savingsRate,
  sumPaise,
} from "@/lib/money";

describe("money parsing", () => {
  it("stores ₹150.50 as 15050 paise", () => {
    expect(parseRupeesToPaise("150.50")).toBe(15050);
    expect(parseRupeesToPaise("150.5")).toBe(15050);
    expect(parseRupeesToPaise("₹1,500")).toBe(150000);
    expect(parseRupeesToPaise("0.01")).toBe(1);
  });

  it("rejects malformed, negative, and over-precise amounts", () => {
    for (const bad of ["", "abc", "-5", "1.234", "1e5", "12.", ".5", "NaN", "Infinity"]) {
      expect(parseRupeesToPaise(bad), bad).toBeNull();
    }
  });

  it("rejects amounts above the maximum", () => {
    expect(parseRupeesToPaise("999999999999")).toBeNull();
  });

  it("parses signed amounts for opening balances", () => {
    expect(parseSignedRupeesToPaise("-2500.75")).toBe(-250075);
    expect(parseSignedRupeesToPaise("0")).toBe(0);
    expect(parseSignedRupeesToPaise("--1")).toBeNull();
  });
});

describe("money precision (Test 11)", () => {
  it("adds ₹100.10 + ₹200.20 + ₹50.05 exactly", () => {
    const values = ["100.10", "200.20", "50.05"].map((v) => parseRupeesToPaise(v)!);
    expect(values).toEqual([10010, 20020, 5005]);
    const total = sumPaise(values);
    expect(total).toBe(35035);
    expect(paiseToRupeeString(total)).toBe("350.35");
    expect(formatINR(total)).toBe("₹350.35");
    // The floating-point version is famously wrong; the paise version is not.
    expect(100.1 + 200.2 + 50.05).not.toBe(350.35);
  });

  it("refuses non-integer paise", () => {
    expect(() => sumPaise([1.5])).toThrow();
    expect(() => formatINR(0.1)).toThrow();
  });
});

describe("formatting", () => {
  it("uses Indian digit grouping", () => {
    expect(formatINR(2400000)).toBe("₹24,000.00");
    expect(formatINR(1234567890)).toBe("₹1,23,45,678.90");
    expect(formatINR(-125000)).toBe("-₹1,250.00");
    expect(formatINR(500, { signed: true })).toBe("+₹5.00");
    expect(formatINR(0)).toBe("₹0.00");
  });

  it("formats compact axis labels", () => {
    expect(formatINRCompact(150000000)).toBe("₹15L");
    expect(formatINRCompact(2500000)).toBe("₹25K");
    expect(formatINRCompact(2000000000)).toBe("₹2Cr");
  });

  it("round-trips through the input string format", () => {
    expect(paiseToRupeeString(5)).toBe("0.05");
    expect(paiseToRupeeString(-105)).toBe("-1.05");
    expect(parseRupeesToPaise(paiseToRupeeString(987654))).toBe(987654);
  });
});

describe("savings rate", () => {
  it("is net / income as a percentage", () => {
    expect(savingsRate(2000000, 2500000)).toBe(80);
    expect(savingsRate(-500000, 2500000)).toBe(-20);
  });

  it("is null when there is no income (no division by zero)", () => {
    expect(savingsRate(-500, 0)).toBeNull();
    expect(savingsRate(0, 0)).toBeNull();
  });
});
