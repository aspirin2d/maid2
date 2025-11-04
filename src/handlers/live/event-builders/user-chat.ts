import type { StoryContext, HandlerConfig } from "../../index.js";
import type { LiveEvent } from "../events.js";
import type { EventPromptResult } from "./types.js";

/**
 * Build prompt for user_chat events
 * Regular conversation - needs full context
 */
export async function buildUserChatPrompt(
  event: Extract<LiveEvent, { type: "user_chat" }>,
  ctx: StoryContext,
  config?: HandlerConfig,
): Promise<EventPromptResult> {
  const sections: string[] = [];
  const userPrefix = event.data.username ? `${event.data.username}` : "用户";

  sections.push(`## 当前对话`);
  sections.push(`${userPrefix}: ${event.data.message}`);

  return {
    sections,
    searchText: event.data.message,
    requiresMemory: true,
  };
}
