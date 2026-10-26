"use client";

import { useCallback, useState } from "react";
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import { ApiClientError, errorMessage } from "@/lib/api-client";

/**
 * A fresh idempotency key per form session. The server stores it with the
 * created entry, so double-clicks and network retries cannot create duplicates.
 */
export function useIdempotencyKey() {
  const [key, setKey] = useState(() => crypto.randomUUID());
  const renew = useCallback(() => setKey(crypto.randomUUID()), []);
  return [key, renew] as const;
}

/** Copies server-side field errors onto the form and toasts the summary message. */
export function handleFormError<T extends FieldValues>(form: UseFormReturn<T>, error: unknown) {
  if (error instanceof ApiClientError && error.fieldErrors) {
    for (const [field, messages] of Object.entries(error.fieldErrors)) {
      if (field in form.getValues()) {
        form.setError(field as Path<T>, { type: "server", message: messages[0] });
      }
    }
  }
  toast.error(errorMessage(error));
}
