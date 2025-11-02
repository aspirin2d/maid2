import { Hono } from "hono";
import type { AppVariables } from "../types.js";
import { getMessagesByUser } from "../message.js";

const messagesRoute = new Hono<{ Variables: AppVariables }>();

messagesRoute.get("/", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const extractedParam = c.req.query("extracted");
  let extractedFilter: boolean | null = null;
  if (extractedParam !== undefined) {
    if (extractedParam === "1") {
      extractedFilter = true;
    } else if (extractedParam === "0") {
      extractedFilter = false;
    } else {
      return c.json({ error: "extracted must be 0 or 1" }, 400);
    }
  }

  const storyParam = c.req.query("story");
  let storyId: number | null = null;
  if (storyParam !== undefined) {
    const parsed = Number(storyParam);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return c.json({ error: "story must be a positive integer" }, 400);
    }
    storyId = parsed;
  }

  const filters: { storyId?: number; extracted?: boolean } = {};

  if (storyId !== null) {
    filters.storyId = storyId;
  }
  if (extractedFilter !== null) {
    filters.extracted = extractedFilter;
  }

  const messages = await getMessagesByUser(user.id, filters);

  return c.json({ messages });
});

export default messagesRoute;
