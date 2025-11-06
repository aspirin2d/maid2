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

    // Try to extract clips array - handle different structures
    const clips = parsed.clips || parsed.responses || parsed.messages;

    if (!clips || !Array.isArray(clips)) {
      return null;
    }

    // Extract speech from all clips, handling various field names
    const speeches = clips
      .map((clip: any) => {
        if (!clip) return null;
        // Support multiple possible field names for speech
        return clip.speech || clip.text || clip.content || clip.message;
      })
      .filter(
        (speech: any) => typeof speech === "string" && speech.trim().length > 0,
      )
      .join("");

    return speeches.length > 0 ? speeches : null;
  } catch {
    // Silent fail - return null for unparseable messages
    return null;
  }
}

/**
 * Create a fallback display for assistant messages that couldn't be parsed
 * @param content - Raw content that failed to parse
 * @returns User-friendly fallback text
 */
function createFallbackDisplay(content: string): string {
  // If content is very short, show it as-is
  if (content.length <= 50) {
    return content;
  }

  // Try to extract any "speech" field values using regex as last resort
  const speechMatches = content.match(/"speech"\s*:\s*"([^"]*)"/g);
  if (speechMatches && speechMatches.length > 0) {
    const extractedSpeeches = speechMatches
      .map(match => {
        const valueMatch = match.match(/"speech"\s*:\s*"([^"]*)"/);
        return valueMatch ? valueMatch[1] : null;
      })
      .filter(s => s && s.trim().length > 0)
      .join("");

    if (extractedSpeeches) {
      return extractedSpeeches;
    }
  }

  // If all else fails, show truncated JSON
  return `${content.substring(0, 50)}...`;
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
    const timeInfo = row.createdAt
      ? ` [${dayjs(row.createdAt).fromNow()}]`
      : "";

    if (row.role === "user") {
      lines.push(`用户${timeInfo}: ${row.content}`);
    } else if (row.role === "assistant") {
      const speech = parseAssistantSpeech(row.content);
      if (speech) {
        lines.push(`VTuber${timeInfo}: ${speech}`);
      } else {
        // Fallback: use smart fallback display for unparseable content
        const fallback = createFallbackDisplay(row.content);
        lines.push(`VTuber${timeInfo}: ${fallback}`);
      }
    }
  }

  return lines.join("\n");
}
