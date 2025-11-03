import { Hono } from "hono";
import type { AppVariables } from "../types.js";
import { getMemoriesByUser, deleteMemory } from "../memory.js";
import { requireAuth } from "../middlewares/auth.js";

const memoryRoute = new Hono<{ Variables: AppVariables }>();

// Apply authentication middleware to all memory routes
memoryRoute.use("/*", requireAuth);

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
    const deleted = await deleteMemory(memoryId);
    if (!deleted) {
      return c.json({ error: "Memory not found" }, 404);
    }

    // Verify that the deleted memory belongs to the user
    if (deleted.userId !== user.id) {
      return c.json({ error: "Unauthorized" }, 403);
    }

    return c.body(null, 204);
  } catch (error) {
    console.error("Failed to delete memory", error);
    return c.json({ error: "Failed to delete memory" }, 500);
  }
});

export default memoryRoute;
