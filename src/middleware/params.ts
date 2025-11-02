import type { Context, Next } from "hono";
import type { AppVariables } from "../types.js";

/**
 * Parses a string to a positive integer ID.
 * Returns null if the value is not a valid positive integer.
 */
export function parsePositiveInt(value: string): number | null {
  const numericId = Number(value);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return null;
  }
  return numericId;
}

/**
 * Middleware that validates the :id route parameter is a positive integer.
 * Sets the parsed ID as 'storyId' in context for downstream handlers.
 * Returns 400 Bad Request if the ID is invalid.
 */
export const validateStoryId = async (
  c: Context<{ Variables: AppVariables & { storyId: number } }>,
  next: Next,
) => {
  const id = parsePositiveInt(c.req.param("id"));
  if (!id) {
    return c.json({ error: "Story ID must be a positive integer" }, 400);
  }
  c.set("storyId", id);
  await next();
};
