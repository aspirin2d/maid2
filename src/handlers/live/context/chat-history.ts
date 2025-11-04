import { getMessagesByStory } from "../../../message.js";
import type { StoryContext } from "../../index.js";
import { dayjs } from "./time.js";

/**
 * Parse assistant message to extract speech content from clips
 * @param content - Raw message content (JSON string)
 * @returns Extracted speech or null if parsing fails
 */
function parseAssistantSpeech(content: string): string | null {
  try {
    const parsed = JSON.parse(content);

    if (!parsed.clips || !Array.isArray(parsed.clips)) {
      return null;
    }

    const speeches = parsed.clips
      .map((clip: any) => clip?.speech)
      .filter((speech: any) => typeof speech === "string" && speech.trim().length > 0)
      .join("");

    return speeches.length > 0 ? speeches : null;
  } catch {
    // Silent fail - return null for unparseable messages
    return null;
  }
}

/**
 * Build chat history section with relative time
 * Formats conversation history for inclusion in prompts
 *
 * @param ctx - Story context
 * @param messageLimit - Maximum number of messages to include
 * @returns Formatted chat history as a string
 */
export async function buildChatHistory(
  ctx: StoryContext,
  messageLimit: number,
): Promise<string> {
  const rows = await getMessagesByStory(ctx.story, { lastN: messageLimit });
  const lines: string[] = ["## 聊天历史"];

  const chatHistory = rows.filter(
    (row) => row.role === "user" || row.role === "assistant",
  );

  if (chatHistory.length === 0) {
    lines.push("（没有之前的对话）");
    return lines.join("\n");
  }

  for (const row of chatHistory) {
    const timeInfo = row.createdAt ? ` [${dayjs(row.createdAt).fromNow()}]` : "";

    if (row.role === "user") {
      lines.push(`用户${timeInfo}: ${row.content}`);
    } else if (row.role === "assistant") {
      const speech = parseAssistantSpeech(row.content);
      if (speech) {
        lines.push(`VTuber${timeInfo}: ${speech}`);
      }
    }
  }

  return lines.join("\n");
}
