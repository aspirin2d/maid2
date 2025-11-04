import type { StoryContext, HandlerConfig } from "../../index.js";
import type { LiveEvent } from "../events.js";
import type { EventPromptResult } from "./types.js";

/**
 * Build prompt for simple_text (legacy support)
 * Fallback to simple text handling
 */
export async function buildSimpleTextPrompt(
  event: Extract<LiveEvent, { type: "simple_text" }>,
  ctx: StoryContext,
  config?: HandlerConfig,
): Promise<EventPromptResult> {
  const sections: string[] = [];

  sections.push(`## 当前请求`);
  sections.push(event.data.text);

  return {
    sections,
    searchText: event.data.text,
    requiresMemory: true,
  };
}
