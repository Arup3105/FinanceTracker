export type RawSearchParams = Record<string, string | string[] | undefined>;

/** Keeps the first value of each query parameter (repeated keys are ignored). */
export function firstValues(params: RawSearchParams): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined && first !== "") result[key] = first;
  }
  return result;
}
