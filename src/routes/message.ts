import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AppVariables } from "../types.js";
import db from "../db.js";
import { message, story } from "../schema/db.js";

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

  const conditions = [eq(story.userId, user.id)];
  if (storyId !== null) {
    conditions.push(eq(message.storyId, storyId));
  }
  if (extractedFilter !== null) {
    conditions.push(eq(message.extracted, extractedFilter));
  }

  const whereClause =
    conditions.length === 1 ? conditions[0] : and(...conditions);

  const messages = await db
    .select({
      id: message.id,
      storyId: message.storyId,
      role: message.role,
      content: message.content,
      extracted: message.extracted,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
    })
    .from(message)
    .innerJoin(story, eq(message.storyId, story.id))
    .where(whereClause);

  return c.json({ messages });
});

export default messagesRoute;
