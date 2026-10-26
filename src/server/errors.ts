import "server-only";

export type FieldErrors = Record<string, string[]>;

/** An error whose message is safe to show to the user. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fieldErrors?: FieldErrors,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const unauthorized = () => new AppError(401, "UNAUTHORIZED", "Please sign in to continue.");
export const forbidden = (message = "You are not allowed to do that.") => new AppError(403, "FORBIDDEN", message);
// Missing and not-owned records share one response so IDs cannot be probed.
export const notFound = (what = "Record") => new AppError(404, "NOT_FOUND", `${what} not found.`);
export const conflict = (message: string) => new AppError(409, "CONFLICT", message);
export const badRequest = (message: string, fieldErrors?: FieldErrors) =>
  new AppError(400, "BAD_REQUEST", message, fieldErrors);
export const staleVersion = () =>
  conflict("This record was changed elsewhere. Refresh the page and try again.");

export function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === 11000;
}
