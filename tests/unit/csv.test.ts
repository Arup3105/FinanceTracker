import { describe, expect, it } from "vitest";
import { csvCell, csvRow } from "@/lib/csv";

describe("csv", () => {
  it("quotes cells containing separators, quotes and newlines", () => {
    expect(csvCell('Lunch, "team"')).toBe('"Lunch, ""team"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("neutralises spreadsheet formulas", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("+cmd")).toBe("'+cmd");
    expect(csvCell("@sum")).toBe("'@sum");
  });

  it("keeps negative numbers numeric", () => {
    expect(csvCell("-50.00")).toBe("-50.00");
    expect(csvCell(-5)).toBe("-5");
  });

  it("builds CRLF rows", () => {
    expect(csvRow(["a", 1, undefined])).toBe("a,1,\r\n");
  });
});
