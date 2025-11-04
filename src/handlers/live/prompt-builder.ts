import type { StoryContext, HandlerConfig } from "../index.js";
import { extractRequestText } from "./utils.js";
import {
  getCharacterBasicSettings,
  getStreamProgramSettings,
  getResponseFormatSettings,
} from "./settings/index.js";
import {
  buildTimeContext,
  buildMemoryContext,
  buildChatHistory,
} from "./context/index.js";
import { getEventContext, type LiveEvent } from "./events.js";

/**
 * Cached system prompt to avoid repeated string concatenation
 */
let cachedSystemPrompt: string | null = null;

/**
 * Get default system prompt for VTuber
 * Combines all background settings into a complete prompt
 */
function getDefaultSystemPrompt(): string {
  if (!cachedSystemPrompt) {
    const sections = [
      getCharacterBasicSettings(),
      getStreamProgramSettings(),
      getResponseFormatSettings(),
    ];
    cachedSystemPrompt = sections.join("\n\n");
  }

  return cachedSystemPrompt;
}

/**
 * Build the complete prompt for the VTuber handler
 *
 * This is the main orchestrator that assembles the final prompt by:
 * 1. Getting the system prompt (character settings, stream info, format)
 * 2. Adding current time context
 * 3. Fetching relevant memories and chat history in parallel
 * 4. Adding the current event/request context
 * 5. Adding final instructions for JSON formatting
 */
export async function buildPrompt(
  event: LiveEvent,
  ctx: StoryContext,
  config?: HandlerConfig,
): Promise<string> {
  const messageLimit = (config?.messageLimit as number | undefined) ?? 50;
  const systemPrompt =
    (config?.systemPrompt as string | undefined) ?? getDefaultSystemPrompt();

  const prompt: string[] = [systemPrompt, ""];

  // Add current time context
  prompt.push(buildTimeContext());

  // Extract event context and text for memory search
  const eventContext = getEventContext(event);
  const searchText = extractEventTextForMemory(event);

  // Parallelize independent async operations for better performance
  const [memoryContext, chatHistory] = await Promise.all([
    buildMemoryContext(searchText, ctx, config),
    buildChatHistory(ctx, messageLimit),
  ]);

  // Add memory context if available
  if (memoryContext) {
    prompt.push(memoryContext);
  }

  // Add chat history
  prompt.push(chatHistory);
  prompt.push("");

  // Add current event/request with appropriate section header
  if (eventContext) {
    const sectionHeader = getEventSectionHeader(event);
    prompt.push(`## ${sectionHeader}`);
    prompt.push(eventContext);
    prompt.push("");
  }

  // Add final instructions
  prompt.push(
    "请使用与提供的架构匹配的有效JSON进行响应。",
    "生成1-3个包含body、face和speech字段的片段，以实现富有表现力的VTuber回复。",
  );

  return prompt.join("\n");
}

/**
 * Extract text from event for memory search
 * Only certain event types are relevant for memory lookup
 */
function extractEventTextForMemory(event: LiveEvent): string | null {
  switch (event.type) {
    case "user_chat":
      return event.data.message;
    case "bullet_chat":
      return event.data.message;
    case "simple_text":
      return event.data.text;
    default:
      // Other event types don't need memory search
      return null;
  }
}

/**
 * Get appropriate section header for different event types
 */
function getEventSectionHeader(event: LiveEvent): string {
  switch (event.type) {
    case "user_chat":
    case "bullet_chat":
    case "simple_text":
      return "当前请求";
    case "program_event":
      return "节目状态变化";
    case "gift_event":
      return "收到礼物";
    case "user_interaction":
      return "用户互动";
    case "system_event":
      return "系统事件";
    case "emotion_event":
      return "情绪事件";
    default:
      return "当前事件";
  }
}
