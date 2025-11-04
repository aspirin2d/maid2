import { getMessagesByStory } from "../../../message.js";
import type { StoryContext } from "../../index.js";
import { dayjs } from "./time.js";

/**
 * Build chat history section with relative time
 */
export async function buildChatHistory(
  ctx: StoryContext,
  messageLimit: number,
): Promise<string> {
  const rows = await getMessagesByStory(ctx.story, { lastN: messageLimit });
  const lines: string[] = [];
  lines.push("## 聊天历史");

  const chatHistory = rows.filter(
    (row) => row.role === "user" || row.role === "assistant",
  );

  if (chatHistory.length === 0) {
    lines.push("（没有之前的对话）");
  } else {
    for (const row of chatHistory) {
      const timeInfo = row.createdAt ? ` [${dayjs(row.createdAt).fromNow()}]` : "";

      if (row.role === "user") {
        lines.push(`用户${timeInfo}: ${row.content}`);
      } else if (row.role === "assistant") {
        // Parse clips and extract speech
        try {
          const parsed = JSON.parse(row.content);
          if (parsed.clips && Array.isArray(parsed.clips)) {
            const speeches = parsed.clips
              .map((clip: any) => clip.speech)
              .filter(
                (speech: any) =>
                  typeof speech === "string" && speech.trim().length > 0,
              )
              .join("");
            if (speeches.length > 0) {
              lines.push(`VTuber${timeInfo}: ${speeches}`);
            }
          }
        } catch (error) {
          // If parsing fails, skip this message
          console.error("Failed to parse assistant message:", error);
        }
      }
    }
  }

  return lines.join("\n");
}
