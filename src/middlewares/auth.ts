import type { Context, Next } from "hono";
import type { AppVariables } from "../types.js";

/**
 * Middleware that requires user authentication.
 * Returns 401 Unauthorized if no user is present in context.
 */
export const requireAuth = async (
  c: Context<{ Variables: AppVariables }>,
  next: Next,
) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
};
