/**
 * Simple handler - Basic text message formatting
 */

/**
 * Format and display simple handler output
 * Returns true if successfully formatted, false otherwise
 */
export function formatSimpleHandlerOutput(payload: string): boolean {
  const raw = payload.trim();
  if (!raw) return false;

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return false;
  }

  if (!parsed || typeof parsed !== "object") {
    return false;
  }

  const message = (parsed as { response?: unknown }).response;
  if (typeof message !== "string" || message.trim().length === 0) {
    return false;
  }

  console.log(`\nMessage: ${message}`);
  return true;
}
