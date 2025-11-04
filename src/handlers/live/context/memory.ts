import { embedTexts } from "../../../llm.js";
import { searchSimilarMemories } from "../../../memory.js";
import type { StoryContext, HandlerConfig } from "../../index.js";
import { dayjs } from "./time.js";

/**
 * Build memory context section with relative time
 */
export async function buildMemoryContext(
  request: string | null,
  ctx: StoryContext,
  config?: HandlerConfig,
): Promise<string> {
  if (!request || !ctx.provider) {
    return "";
  }

  try {
    const topK = (config?.memoryTopK as number | undefined) ?? 5;
    const minSimilarity = (config?.memoryMinSimilarity as number | undefined) ?? 0.5;

    const [queryEmbedding] = await embedTexts(ctx.provider, [request]);
    const memories = await searchSimilarMemories(queryEmbedding, {
      userId: ctx.userId,
      topK,
      minSimilarity,
    });

    if (memories.length === 0) {
      return "";
    }

    const lines: string[] = [];
    lines.push("## 记忆上下文");
    lines.push("以下信息是从之前的对话中提取的：");
    lines.push("");

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
    console.error("Failed to retrieve memories for context:", error);
    return "";
  }
}
