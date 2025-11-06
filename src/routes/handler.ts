import { Hono } from "hono";
import { z } from "zod";
import type { AppVariables } from "../types.js";
import { listHandlersWithMetadata } from "../handlers/index.js";
import { requireAuth } from "../middlewares/auth.js";

const handlersRoute = new Hono<{ Variables: AppVariables }>();

// Apply authentication middleware to all handler routes
handlersRoute.use("/*", requireAuth);

/**
 * GET /api/v1/handlers
 * List all available story handlers with metadata
 */
handlersRoute.get("/", async (c) => {
  try {
    const handlers = listHandlersWithMetadata().map((entry) => {
      const result: any = { name: entry.name };

      if (entry.metadata) {
        result.description = entry.metadata.description;
        result.version = entry.metadata.version;
        result.capabilities = entry.metadata.capabilities;

        // Convert Zod schemas to JSON Schema if available
        if (entry.metadata.inputSchema) {
          try {
            result.inputSchema = z.toJSONSchema(entry.metadata.inputSchema);
          } catch {
            // Ignore schema conversion errors
          }
        }
        if (entry.metadata.outputSchema) {
          try {
            result.outputSchema = z.toJSONSchema(entry.metadata.outputSchema);
          } catch {
            // Ignore schema conversion errors
          }
        }
      }

      return result;
    });
    return c.json({ handlers });
  } catch (error) {
    console.error("Failed to fetch story handlers", error);
    return c.json({ error: "Failed to fetch story handlers" }, 500);
  }
});

export default handlersRoute;
