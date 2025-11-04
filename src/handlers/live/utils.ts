/**
 * Shared utilities for the live handler
 */

/**
 * Extract text content from various input formats
 */
export function extractRequestText(input: unknown): string | null {
  if (typeof input === "string") {
    const trimmed = input.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (input && typeof input === "object") {
    const candidate =
      (input as Record<string, unknown>).prompt ??
      (input as Record<string, unknown>).question ??
      (input as Record<string, unknown>).message ??
      (input as Record<string, unknown>).input;
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
    try {
      return JSON.stringify(input);
    } catch {
      return null;
    }
  }
  return null;
}
