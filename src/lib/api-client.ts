/**
 * Browser-side helper for calling the app's Route Handlers. Errors are thrown
 * as ApiClientError carrying the server's safe message and field errors.
 */
export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export async function apiRequest<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: init.method ?? "GET",
      headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: "same-origin",
    });
  } catch {
    throw new ApiClientError("Network error. Check your connection and try again.", 0);
  }

  if (response.status === 401) {
    // A full navigation (not router.push) clears all client state after the session expired.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    throw new ApiClientError("Your session has expired. Please sign in again.", 401);
  }

  const payload = (await response.json().catch(() => null)) as
    | { data?: T; error?: { message: string; fieldErrors?: Record<string, string[]> } }
    | null;

  if (!response.ok) {
    throw new ApiClientError(
      payload?.error?.message ?? "Something went wrong. Please try again.",
      response.status,
      payload?.error?.fieldErrors,
    );
  }
  return payload?.data as T;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}
