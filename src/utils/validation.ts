import { z } from "zod";

/**
 * Formats a Zod validation error into a user-friendly message.
 * Returns the first error message or a generic fallback.
 */
export function formatZodError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid request body";
}

/**
 * Converts data to a string suitable for SSE transmission.
 * Handles strings, objects (via JSON), and other types.
 */
export function toData(d: unknown): string {
  if (typeof d === "string") return d;
  try {
    return JSON.stringify(d);
  } catch {
    return String(d);
  }
}
