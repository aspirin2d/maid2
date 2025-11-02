import { Hono } from "hono";
import { z } from "zod";
import type { AppVariables } from "../types.js";
import { getMessagesByUser } from "../message.js";
import { requireAuth } from "../middleware/auth.js";
import { formatZodError } from "../validation.js";

const messagesRoute = new Hono<{ Variables: AppVariables }>();

// Apply authentication middleware to all message routes
messagesRoute.use("/*", requireAuth);

// Query parameter validation schema
const messageQuerySchema = z.object({
  extracted: z
    .enum(["0", "1"])
    .optional()
    .transform((v) => (v === "1" ? true : v === "0" ? false : undefined)),
  story: z
    .string()
    .regex(/^\d+$/, "story must be a positive integer")
    .transform(Number)
    .optional(),
});

messagesRoute.get("/", async (c) => {
  const user = c.get("user")!; // Safe: requireAuth middleware ensures user exists

  // Parse and validate query parameters
  const queryParams = {
    extracted: c.req.query("extracted"),
    story: c.req.query("story"),
  };

  const parsed = messageQuerySchema.safeParse(queryParams);
  if (!parsed.success) {
    return c.json({ error: formatZodError(parsed.error) }, 400);
  }

  const filters: { storyId?: number; extracted?: boolean } = {};

  if (parsed.data.story !== undefined) {
    filters.storyId = parsed.data.story;
  }
  if (parsed.data.extracted !== undefined) {
    filters.extracted = parsed.data.extracted;
  }

  const messages = await getMessagesByUser(user.id, filters);

  return c.json({ messages });
});

export default messagesRoute;
