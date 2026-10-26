/**
 * CSV helpers. Cells that could be interpreted as spreadsheet formulas are
 * prefixed with a single quote (CSV injection protection).
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  const isPlainNumber = /^-?\d+(\.\d+)?$/.test(text);
  if (typeof value === "string" && !isPlainNumber && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function csvRow(values: ReadonlyArray<string | number | null | undefined>): string {
  return `${values.map(csvCell).join(",")}\r\n`;
}
