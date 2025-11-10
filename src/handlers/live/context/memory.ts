import { embedTexts } from "../../../llm.js";
import { searchSimilarMemories } from "../../../memory.js";
import type { StoryContext, HandlerConfig } from "../../index.js";
import { dayjs } from "./time.js";

/**
 * Build memory context section with semantic search
 *
 * Retrieves relevant memories from previous conversations using vector similarity.
 * Memories are formatted with their category and relative time for context.
 *
 * @param request - Search query text (typically the user's current message)
 * @param ctx - Story context containing user and provider information
 * @param config - Optional configuration with memoryTopK and memoryMinSimilarity
 * @returns Formatted memory context string, or empty string if no relevant memories
 */
export async function buildMemoryContext(
  request: string | null,
  ctx: StoryContext,
  config?: HandlerConfig,
): Promise<string> {
  // Skip memory retrieval if no search text or provider
  if (!request || !ctx.embeddingProvider) {
    if (!request) {
      console.debug('[MemoryContext] Skipping: no search text provided');
    }
    if (!ctx.embeddingProvider) {
      console.debug('[MemoryContext] Skipping: no embedding provider configured');
    }
    return "";
  }

  try {
    // Extract configuration with sensible defaults
    const topK = (config?.memoryTopK as number | undefined) ?? 5;
    const minSimilarity =
      (config?.memoryMinSimilarity as number | undefined) ?? 0.1;

    // Generate embedding for semantic search
    const [queryEmbedding] = await embedTexts(ctx.embeddingProvider, [request]);

    if (!queryEmbedding || queryEmbedding.length === 0) {
      console.warn('[MemoryContext] Empty embedding returned from provider');
      return "";
    }

    // Search for similar memories
    const memories = await searchSimilarMemories(queryEmbedding, {
      userId: ctx.userId,
      topK,
      minSimilarity,
    });

    if (memories.length === 0) {
      console.debug('[MemoryContext] No relevant memories found');
      return "";
    }

    console.debug(`[MemoryContext] Retrieved ${memories.length} memories`);

    // Format memories for prompt inclusion
    const lines: string[] = [
      "## 记忆上下文",
      "以下信息是从之前的对话中提取的：",
      "",
    ];

    for (const { memory } of memories) {
      const categoryLabel =
        memory.category?.replace(/_/g, " ").toLowerCase() || "other";
      const relativeTimeStr = memory.createdAt
        ? ` (${dayjs(memory.createdAt).fromNow()})`
        : "";
      lines.push(`- [${categoryLabel}]${relativeTimeStr} ${memory.content}`);
    }
    lines.push("");

    return lines.join("\n");
  } catch (error) {
    // Fail gracefully - don't break the handler if memory retrieval fails
    console.error('[MemoryContext] Failed to retrieve memories:', {
      error: error instanceof Error ? error.message : String(error),
      userId: ctx.userId,
      provider: ctx.embeddingProvider,
      requestLength: request.length,
    });
    return "";
  }
}
