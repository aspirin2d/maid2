import type { Context, Next } from "hono";
import type { AppVariables } from "../types.js";
import { listStoryHandlers } from "../story-handler/index.js";

/**
 * Validates that a handler name exists in the registry
 * Used for handler validation in routes
 */
export function isValidHandler(name: string): boolean {
  return listStoryHandlers().includes(name);
}

/**
 * Middleware to validate handler exists before processing request
 * Useful for routes that depend on handler existence
 */
export const validateHandler = async (
  c: Context<{ Variables: AppVariables }>,
  next: Next,
) => {
  const handlerName = c.req.param("handler");

  if (!handlerName) {
    return c.json({ error: "Handler name is required" }, 400);
  }

  if (!isValidHandler(handlerName)) {
    return c.json({ error: `Invalid handler: ${handlerName}` }, 400);
  }

  await next();
};
