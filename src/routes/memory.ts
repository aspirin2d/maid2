import { Hono } from "hono";
import { z } from "zod";
import type { AppVariables } from "../types.js";
import { MEMORY_CATEGORIES } from "../types.js";
import { getMemoriesByUser, getMemoryById, deleteMemory, insertMemory, updateMemory } from "../memory.js";
import { requireAuth } from "../middlewares/auth.js";
import { formatZodError } from "../validation.js";
import { extractMemoriesForUser } from "../extraction.js";

const memoryRoute = new Hono<{ Variables: AppVariables }>();

// Apply authentication middleware to all memory routes
memoryRoute.use("/*", requireAuth);

const providerEnum = z.enum(["openai", "ollama"]);
type Provider = z.infer<typeof providerEnum>;

const DEFAULT_PROVIDER: Provider = "openai";

const memoryCategoryEnum = z.enum(MEMORY_CATEGORIES);

const createMemorySchema = z.strictObject({
  content: z.string().trim().min(1, "Memory content is required"),
  category: memoryCategoryEnum.optional(),
  importance: z.number().min(0).max(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
  provider: providerEnum.optional(),
});

const updateMemorySchema = z.strictObject({
  content: z.string().trim().min(1, "Memory content cannot be empty").optional(),
  category: memoryCategoryEnum.optional(),
  importance: z.number().min(0).max(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
  provider: providerEnum.optional(),
});

/**
 * GET /api/mem
 * List all memories for the authenticated user
 */
memoryRoute.get("/", async (c) => {
  const user = c.get("user")!; // Safe: requireAuth middleware ensures user exists

  try {
    const memories = await getMemoriesByUser(user.id);
    return c.json({ memories });
  } catch (error) {
    console.error("Failed to list memories", error);
    return c.json({ error: "Failed to list memories" }, 500);
  }
});

/**
 * POST /api/mem/extract
 * Extract memories from unextracted messages for the authenticated user
 */
memoryRoute.post("/extract", async (c) => {
  const user = c.get("user")!; // Safe: requireAuth middleware ensures user exists

  const payload = await c.req.json().catch(() => undefined);
  const parsed = z.strictObject({
    provider: providerEnum.optional(),
  }).safeParse(payload);

  if (!parsed.success) {
    return c.json({ error: formatZodError(parsed.error) }, 400);
  }

  const { provider } = parsed.data;
  const resolvedProvider = provider ?? DEFAULT_PROVIDER;

  try {
    const result = await extractMemoriesForUser(user.id, resolvedProvider);
    return c.json({
      factsExtracted: result.factsExtracted,
      memoriesUpdated: result.memoriesUpdated,
      messagesExtracted: result.messagesExtracted,
    });
  } catch (error) {
    console.error("Failed to extract memories", error);
    return c.json({ error: "Failed to extract memories" }, 500);
  }
});

/**
 * POST /api/mem
 * Create a new memory for the authenticated user
 */
memoryRoute.post("/", async (c) => {
  const user = c.get("user")!; // Safe: requireAuth middleware ensures user exists

  const payload = await c.req.json().catch(() => undefined);
  const parsed = createMemorySchema.safeParse(payload);
  if (!parsed.success) {
    return c.json({ error: formatZodError(parsed.error) }, 400);
  }

  const { content, category, importance, confidence, provider } = parsed.data;
  const resolvedProvider = provider ?? DEFAULT_PROVIDER;

  try {
    const memory = await insertMemory(resolvedProvider, {
      userId: user.id,
      content,
      category: category ?? null,
      importance: importance ?? null,
      confidence: confidence ?? null,
    });

    if (!memory) {
      return c.json({ error: "Failed to create memory" }, 500);
    }

    return c.json({ memory }, 201);
  } catch (error) {
    console.error("Failed to create memory", error);
    return c.json({ error: "Failed to create memory" }, 500);
  }
});

/**
 * PUT /api/mem/:id
 * Update a specific memory by ID
 */
memoryRoute.put("/:id", async (c) => {
  const user = c.get("user")!; // Safe: requireAuth middleware ensures user exists
  const idParam = c.req.param("id");

  const memoryId = parseInt(idParam, 10);
  if (isNaN(memoryId)) {
    return c.json({ error: "Invalid memory ID" }, 400);
  }

  const payload = await c.req.json().catch(() => undefined);
  const parsed = updateMemorySchema.safeParse(payload);
  if (!parsed.success) {
    return c.json({ error: formatZodError(parsed.error) }, 400);
  }

  const { content, category, importance, confidence, provider } = parsed.data;
  const resolvedProvider = provider ?? DEFAULT_PROVIDER;

  try {
    // First check if the memory exists and belongs to the user
    const existingMemory = await getMemoryById(user.id, memoryId);

    if (!existingMemory) {
      return c.json({ error: "Memory not found" }, 404);
    }

    // Build update object
    const updates: any = {};
    if (category !== undefined) updates.category = category;
    if (importance !== undefined) updates.importance = importance;
    if (confidence !== undefined) updates.confidence = confidence;

    // If content is being updated, regenerate the embedding
    if (content !== undefined) {
      updates.content = content;
      updates.prevContent = existingMemory.content;

      // Import embedText to generate new embedding
      const { embedText } = await import("../llm.js");
      const embedding = await embedText(resolvedProvider, content);
      updates.embedding = embedding;
    }

    const updated = await updateMemory(user.id, memoryId, updates);

    if (!updated) {
      return c.json({ error: "Failed to update memory" }, 500);
    }

    return c.json({ memory: updated });
  } catch (error) {
    console.error("Failed to update memory", error);
    return c.json({ error: "Failed to update memory" }, 500);
  }
});

/**
 * DELETE /api/mem/:id
 * Delete a specific memory by ID
 */
memoryRoute.delete("/:id", async (c) => {
  const user = c.get("user")!; // Safe: requireAuth middleware ensures user exists
  const idParam = c.req.param("id");

  const memoryId = parseInt(idParam, 10);
  if (isNaN(memoryId)) {
    return c.json({ error: "Invalid memory ID" }, 400);
  }

  try {
    const deleted = await deleteMemory(user.id, memoryId);
    if (!deleted) {
      return c.json({ error: "Memory not found" }, 404);
    }

    return c.body(null, 204);
  } catch (error) {
    console.error("Failed to delete memory", error);
    return c.json({ error: "Failed to delete memory" }, 500);
  }
});

export default memoryRoute;
