import { Hono } from "hono";
import { z } from "zod";
import type { AppVariables } from "../types.js";
import { getStoryHandler } from "../handlers/index.js";
import {
  getStoriesByUser,
  getStoryById,
  storyExists,
  createStory,
  updateStory,
  deleteStory,
} from "../story.js";
import { deleteMessagesByStory } from "../message.js";
import { requireAuth } from "../middlewares/auth.js";
import { validateStoryId } from "../middlewares/params.js";
import { isValidHandler } from "../middlewares/handler.js";
import { formatZodError } from "../validation.js";
import { streamWithAdapter } from "../streaming.js";

const storiesRoute = new Hono<{ Variables: AppVariables }>();

// Apply authentication middleware to all story routes
storiesRoute.use("/*", requireAuth);

const embeddingProviderEnum = z.enum(["openai", "ollama", "dashscope"]);
const llmProviderEnum = z.enum(["openai", "ollama"]);
type EmbeddingProvider = z.infer<typeof embeddingProviderEnum>;
type LlmProvider = z.infer<typeof llmProviderEnum>;
const handlerSchema = z.string().trim().min(1, "Story handler is required");

const DEFAULT_EMBEDDING_PROVIDER: EmbeddingProvider = "dashscope";
const DEFAULT_LLM_PROVIDER: LlmProvider = "openai";
const DEFAULT_HANDLER = "simple";

const createStorySchema = z.strictObject({
  name: z.string().trim().min(1, "Story name is required"),
  embeddingProvider: embeddingProviderEnum.optional(),
  llmProvider: llmProviderEnum.optional(),
  handler: handlerSchema.optional(),
});

const updateStorySchema = z.strictObject({
  name: z.string().trim().min(1, "Story name cannot be empty").optional(),
  embeddingProvider: embeddingProviderEnum.optional(),
  llmProvider: llmProviderEnum.optional(),
  handler: handlerSchema.optional(),
});

storiesRoute.get("/", async (c) => {
  const user = c.get("user")!; // Safe: requireAuth middleware ensures user exists

  try {
    const stories = await getStoriesByUser(user.id);
    return c.json({ stories });
  } catch (error) {
    console.error("Failed to list stories", error);
    return c.json({ error: "Failed to list stories" }, 500);
  }
});

storiesRoute.get("/:id", validateStoryId, async (c) => {
  const user = c.get("user")!; // Safe: requireAuth middleware ensures user exists
  const id = c.get("storyId"); // Safe: validateStoryId middleware ensures valid ID

  try {
    const result = await getStoryById(user.id, id);
    if (!result) {
      return c.json({ error: "Story not found" }, 404);
    }

    return c.json({ story: result });
  } catch (error) {
    console.error("Failed to fetch story", error);
    return c.json({ error: "Failed to fetch story" }, 500);
  }
});

storiesRoute.post("/", async (c) => {
  const user = c.get("user")!; // Safe: requireAuth middleware ensures user exists

  const payload = await c.req.json().catch(() => undefined);
  const parsed = createStorySchema.safeParse(payload);
  if (!parsed.success) {
    return c.json({ error: formatZodError(parsed.error) }, 400);
  }

  const { name, embeddingProvider, llmProvider, handler } = parsed.data;
  const resolvedEmbeddingProvider =
    embeddingProvider ?? DEFAULT_EMBEDDING_PROVIDER;
  const resolvedLlmProvider = llmProvider ?? DEFAULT_LLM_PROVIDER;
  const resolvedHandler = handler ?? DEFAULT_HANDLER;

  if (!isValidHandler(resolvedHandler)) {
    return c.json({ error: `Invalid handler: ${resolvedHandler}` }, 400);
  }

  try {
    const inserted = await createStory(
      user.id,
      name,
      resolvedEmbeddingProvider,
      resolvedLlmProvider,
      resolvedHandler,
    );
    return c.json({ story: inserted }, 201);
  } catch (error) {
    console.error("Failed to create story", error);
    return c.json({ error: "Failed to create story" }, 500);
  }
});

storiesRoute.patch("/:id", validateStoryId, async (c) => {
  const user = c.get("user")!; // Safe: requireAuth middleware ensures user exists
  const id = c.get("storyId"); // Safe: validateStoryId middleware ensures valid ID

  const payload = await c.req.json().catch(() => undefined);
  const parsed = updateStorySchema.safeParse(payload);
  if (!parsed.success) {
    return c.json({ error: formatZodError(parsed.error) }, 400);
  }

  const updates: Partial<{
    name: string;
    embeddingProvider: "openai" | "ollama" | "dashscope";
    llmProvider: "openai" | "ollama";
    handler: string;
  }> = {};
  if (parsed.data.name !== undefined) {
    updates.name = parsed.data.name;
  }
  if (parsed.data.embeddingProvider !== undefined) {
    updates.embeddingProvider = parsed.data.embeddingProvider;
  }
  if (parsed.data.llmProvider !== undefined) {
    updates.llmProvider = parsed.data.llmProvider;
  }
  if (parsed.data.handler !== undefined) {
    if (!isValidHandler(parsed.data.handler)) {
      return c.json({ error: `Invalid handler: ${parsed.data.handler}` }, 400);
    }
    updates.handler = parsed.data.handler;
  }

  if (Object.keys(updates).length === 0) {
    return c.json({ error: "No valid fields to update" }, 400);
  }

  try {
    const updated = await updateStory(user.id, id, updates);
    if (!updated) {
      return c.json({ error: "Story not found" }, 404);
    }

    return c.json({ story: updated });
  } catch (error) {
    console.error("Failed to update story", error);
    return c.json({ error: "Failed to update story" }, 500);
  }
});

storiesRoute.delete("/:id", validateStoryId, async (c) => {
  const user = c.get("user")!; // Safe: requireAuth middleware ensures user exists
  const id = c.get("storyId"); // Safe: validateStoryId middleware ensures valid ID

  try {
    const deleted = await deleteStory(user.id, id);
    if (!deleted) {
      return c.json({ error: "Story not found" }, 404);
    }

    return c.body(null, 204);
  } catch (error) {
    console.error("Failed to delete story", error);
    return c.json({ error: "Failed to delete story" }, 500);
  }
});

storiesRoute.delete("/:id/messages", validateStoryId, async (c) => {
  const user = c.get("user")!; // Safe: requireAuth middleware ensures user exists
  const id = c.get("storyId"); // Safe: validateStoryId middleware ensures valid ID

  try {
    const deletedCount = await deleteMessagesByStory(user.id, id);
    if (deletedCount === 0) {
      // Could mean story not found or no messages existed
      const exists = await storyExists(user.id, id);
      if (!exists) {
        return c.json({ error: "Story not found" }, 404);
      }
    }

    return c.json({ deletedCount });
  } catch (error) {
    console.error("Failed to clear messages", error);
    return c.json({ error: "Failed to clear messages" }, 500);
  }
});

// Input contract: accept flexible input formats
const streamInput = z.union([
  z.string(),
  z.object({
    prompt: z.string().optional(),
    question: z.string().optional(),
    message: z.string().optional(),
    input: z.string().optional(),
  }),
  z.record(z.string(), z.unknown()), // Allow other object shapes to be handled by handler
]);

// ================
// Route: /messages
// ================
storiesRoute.post("/:id/messages", validateStoryId, async (c) => {
  const user = c.get("user")!; // Safe: requireAuth middleware ensures user exists
  const id = c.get("storyId"); // Safe: validateStoryId middleware ensures valid ID

  const payload = await c.req.json().catch(() => undefined);
  const parsed = streamInput.safeParse(payload);
  if (!parsed.success) {
    return c.json({ error: formatZodError(parsed.error) }, 400);
  }

  const currentStory = await getStoryById(user.id, id);
  if (!currentStory) {
    return c.json({ error: "Story not found" }, 404);
  }
  const resolvedEmbeddingProvider = currentStory.embeddingProvider;
  const resolvedLlmProvider = currentStory.llmProvider;
  const resolvedHandler = currentStory.handler;

  if (!isValidHandler(resolvedHandler)) {
    return c.json({ error: `handler not found: ${resolvedHandler}` }, 400);
  }

  // 1) Resolve handler (instantiate per request with context)
  // Note: Handler config support is available but not persisted to DB
  const handler = getStoryHandler(resolvedHandler, {
    story: id,
    userId: user.id,
    embeddingProvider: resolvedEmbeddingProvider,
    llmProvider: resolvedLlmProvider,
  });
  if (!handler)
    return c.json({ error: `handler not found: ${resolvedHandler}` }, 400);

  // 2) Let handler render prompt and JSON Schema, and optional bypass
  // Extract the 'input' field if present, otherwise use the entire payload
  const handlerInput =
    typeof parsed.data === "object" &&
    parsed.data !== null &&
    "input" in parsed.data
      ? parsed.data.input
      : parsed.data;
  const renderData = await handler.init(handlerInput);
  if (!renderData) return c.json({ ok: true }, 200);

  const { prompt, schema } = renderData;

  // 3) Use streaming adapter to handle the complexity
  return streamWithAdapter(c, {
    llmProvider: resolvedLlmProvider,
    handler,
    prompt,
    schema,
    storyId: id,
  });
});

export default storiesRoute;
