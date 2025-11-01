import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AppVariables } from "../app-context.js";
import db from "../db.js";
import { story } from "../schema/db.js";

const storiesRoute = new Hono<{ Variables: AppVariables }>();

storiesRoute.get("/", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const stories = await db
      .select()
      .from(story)
      .where(eq(story.userId, user.id));

    return c.json({ stories });
  } catch (error) {
    console.error("Failed to list stories", error);
    return c.json({ error: "Failed to list stories" }, 500);
  }
});

storiesRoute.get("/:id", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const id = parseStoryId(c.req.param("id"));
  if (!id) {
    return c.json({ error: "Story ID must be a positive integer" }, 400);
  }

  try {
    const result = await db
      .select()
      .from(story)
      .where(and(eq(story.userId, user.id), eq(story.id, id)))
      .limit(1);

    if (result.length === 0) {
      return c.json({ error: "Story not found" }, 404);
    }

    return c.json({ story: result[0] });
  } catch (error) {
    console.error("Failed to fetch story", error);
    return c.json({ error: "Failed to fetch story" }, 500);
  }
});

storiesRoute.post("/", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json<{ name?: string }>().catch(() => undefined);
  const name = body?.name?.trim();

  if (!name) {
    return c.json({ error: "Story name is required" }, 400);
  }

  try {
    const inserted = await db
      .insert(story)
      .values({ userId: user.id, name })
      .returning();

    return c.json({ story: inserted[0] }, 201);
  } catch (error) {
    console.error("Failed to create story", error);
    return c.json({ error: "Failed to create story" }, 500);
  }
});

storiesRoute.patch("/:id", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const id = parseStoryId(c.req.param("id"));
  if (!id) {
    return c.json({ error: "Story ID must be a positive integer" }, 400);
  }

  const body = await c.req.json<{ name?: string }>().catch(() => undefined);
  const updates: { name?: string } = {};

  if (body?.name !== undefined) {
    const trimmed = body.name.trim();
    if (!trimmed) {
      return c.json({ error: "Story name cannot be empty" }, 400);
    }
    updates.name = trimmed;
  }

  if (Object.keys(updates).length === 0) {
    return c.json({ error: "No valid fields to update" }, 400);
  }

  try {
    const updated = await db
      .update(story)
      .set(updates)
      .where(and(eq(story.userId, user.id), eq(story.id, id)))
      .returning();

    if (updated.length === 0) {
      return c.json({ error: "Story not found" }, 404);
    }

    return c.json({ story: updated[0] });
  } catch (error) {
    console.error("Failed to update story", error);
    return c.json({ error: "Failed to update story" }, 500);
  }
});

storiesRoute.delete("/:id", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const id = parseStoryId(c.req.param("id"));
  if (!id) {
    return c.json({ error: "Story ID must be a positive integer" }, 400);
  }

  try {
    const deleted = await db
      .delete(story)
      .where(and(eq(story.userId, user.id), eq(story.id, id)))
      .returning();

    if (deleted.length === 0) {
      return c.json({ error: "Story not found" }, 404);
    }

    return c.body(null, 204);
  } catch (error) {
    console.error("Failed to delete story", error);
    return c.json({ error: "Failed to delete story" }, 500);
  }
});

function parseStoryId(value: string) {
  const numericId = Number(value);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return null;
  }
  return numericId;
}

export default storiesRoute;
