import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { requireAuth } from "../middlewares/auth.js";
import { searchSimilarClipsByText } from "../clip.js";
import type { Provider } from "../llm.js";

const app = new Hono();

// Search clips by text query
const searchQuerySchema = z.object({
  q: z.string().min(1).describe("Search query text"),
  topK: z.coerce.number().int().min(1).max(100).optional().default(10),
  originId: z.string().optional(),
  minSimilarity: z.coerce.number().min(0).max(1).optional(),
  provider: z.enum(["openai", "ollama"]).optional().default("openai"),
});

app.get(
  "/search",
  requireAuth,
  zValidator("query", searchQuerySchema),
  async (c) => {
    const { q, topK, originId, minSimilarity, provider } = c.req.valid("query");

    try {
      const results = await searchSimilarClipsByText(
        provider as Provider,
        q,
        { topK, originId, minSimilarity }
      );

      return c.json({
        query: q,
        count: results.length,
        results: results.map((r) => ({
          clip: {
            id: r.clip.id,
            originId: r.clip.originId,
            startFrame: r.clip.startFrame,
            endFrame: r.clip.endFrame,
            videoUrl: r.clip.videoUrl,
            animationUrl: r.clip.animationUrl,
            description: r.clip.description,
            createdAt: r.clip.createdAt,
            updatedAt: r.clip.updatedAt,
          },
          similarity: r.similarity,
        })),
      });
    } catch (error) {
      console.error("Failed to search clips:", error);
      return c.json(
        {
          error: "Failed to search clips",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        500
      );
    }
  }
);

export default app;
