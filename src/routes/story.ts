import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppVariables } from "../types.js";
import db from "../db.js";
import { story } from "../schema/db.js";
import { getStoryHandler } from "../story-handler/index.js";
import { streamSSE } from "hono/streaming";
import { streamOpenAIStructured, streamOllamaStructured } from "../llm.js";

const storiesRoute = new Hono<{ Variables: AppVariables }>();

const createStorySchema = z
  .object({
    name: z.string().trim().min(1, "Story name is required"),
  })
  .strict();

const updateStorySchema = z
  .object({
    name: z.string().trim().min(1, "Story name cannot be empty").optional(),
  })
  .strict();

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

  const payload = await c.req.json().catch(() => undefined);
  const parsed = createStorySchema.safeParse(payload);
  if (!parsed.success) {
    return c.json({ error: formatZodError(parsed.error) }, 400);
  }

  const { name } = parsed.data;

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

  const payload = await c.req.json().catch(() => undefined);
  const parsed = updateStorySchema.safeParse(payload);
  if (!parsed.success) {
    return c.json({ error: formatZodError(parsed.error) }, 400);
  }

  const updates: { name?: string } = {};
  if (parsed.data.name !== undefined) {
    updates.name = parsed.data.name;
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

// Input contract
const streamInput = z.object({
  handler: z.string(),
  input: z.any(),
  provider: z.enum(["openai", "ollama"]).optional(),
});

// ==============
// Route: /stream
// ==============
storiesRoute.post("/:id/stream", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const id = parseStoryId(c.req.param("id"));
  if (!id) {
    return c.json({ error: "Story ID must be a positive integer" }, 400);
  }

  const payload = await c.req.json().catch(() => undefined);
  const parsed = streamInput.safeParse(payload);
  if (!parsed.success) {
    return c.json({ error: formatZodError(parsed.error) }, 400);
  }
  const { handler: handlerName, input, provider } = parsed.data;

  // 1) Resolve handler (instantiate per request with context)
  const handler = getStoryHandler(handlerName, { story: id, provider });
  if (!handler)
    return c.json({ error: `handler not found: ${handlerName}` }, 400);

  // 2) Let handler render prompt and JSON Schema, and optional bypass
  const renderData = await handler.init(input);
  if (!renderData) return c.json({ ok: true }, 200);

  const { prompt, schema } = renderData;

  if (provider === "openai") {
    return streamSSE(c, async (output) => {
      try {
        const startEvent = handler.onStart();
        await output.writeSSE({
          event: startEvent.event,
          data: toData(startEvent.data),
        });

        for await (const ev of streamOpenAIStructured({
          prompt,
          format: { name: "output", schema: z.toJSONSchema(schema) },
        })) {
          if (ev.type === "delta") {
            const deltaEvent = handler.onContent(ev.data);
            await output.writeSSE({
              event: deltaEvent.event,
              data: toData(deltaEvent.data),
            });
          }
          if (ev.type === "error") {
            await output.writeSSE({ event: "error", data: ev.data });
            break;
          }
          if (ev.type === "done") break;
        }
        const finishEvent = await handler.onFinish();
        await output.writeSSE({
          event: finishEvent.event,
          data: toData(finishEvent.data),
        });
      } catch (e) {
        console.log(e);
        await output.writeSSE({
          event: "finish",
          data: toData({
            done: true,
            error: e instanceof Error ? e.message : String(e),
          }),
        });
      }
    });
  }

  // provider === 'ollama'
  return streamSSE(c, async (output) => {
    // Provider streaming loop; surface provider errors
    try {
      const startEvent = handler.onStart();
      await output.writeSSE({
        event: startEvent.event,
        data: toData(startEvent.data),
      });
      for await (const ev of streamOllamaStructured({
        prompt,
        format: { name: "output", schema: z.toJSONSchema(schema) },
      })) {
        if (ev.type === "thinking") {
          const thinkingEvent = handler.onThinking(ev.data);
          await output.writeSSE({
            event: thinkingEvent.event,
            data: toData(thinkingEvent.data),
          });
        }
        if (ev.type === "delta") {
          const deltaEvent = handler.onContent(ev.data);
          await output.writeSSE({
            event: deltaEvent.event,
            data: toData(deltaEvent.data),
          });
        }
        if (ev.type === "error") {
          await output.writeSSE({ event: "error", data: ev.data });
        }
        if (ev.type === "done") break;
      }
      const finishEvent = await handler.onFinish();
      await output.writeSSE({
        event: finishEvent.event,
        data: toData(finishEvent.data),
      });
    } catch (e) {
      console.error(e);
      await output.writeSSE({
        event: "error",
        data: toData(e instanceof Error ? e.message : String(e)),
      });
    }
  });
});

function parseStoryId(value: string) {
  const numericId = Number(value);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return null;
  }
  return numericId;
}

export default storiesRoute;

function formatZodError(error: z.ZodError) {
  return error.issues[0]?.message ?? "Invalid request body";
}

export function toData(d: unknown): string {
  if (typeof d === "string") return d;
  try {
    return JSON.stringify(d);
  } catch {
    return String(d);
  }
}
