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
 * 4. Adding the current user request
 * 5. Adding final instructions for JSON formatting
 */
export async function buildPrompt(
  input: any,
  ctx: StoryContext,
  config?: HandlerConfig,
): Promise<string> {
  const messageLimit = (config?.messageLimit as number | undefined) ?? 50;
  const systemPrompt =
    (config?.systemPrompt as string | undefined) ?? getDefaultSystemPrompt();

  const prompt: string[] = [systemPrompt, ""];

  // Add current time context
  prompt.push(buildTimeContext());

  // Extract user request for memory search
  const request = extractRequestText(input);

  // Parallelize independent async operations for better performance
  const [memoryContext, chatHistory] = await Promise.all([
    buildMemoryContext(request, ctx, config),
    buildChatHistory(ctx, messageLimit),
  ]);

  // Add memory context if available
  if (memoryContext) {
    prompt.push(memoryContext);
  }

  // Add chat history
  prompt.push(chatHistory);
  prompt.push("");

  // Add current request
  if (request) {
    prompt.push("## 当前请求");
    prompt.push(request);
    prompt.push("");
  }

  // Add final instructions
  prompt.push(
    "请使用与提供的架构匹配的有效JSON进行响应。",
    "生成1-3个包含body、face和speech字段的片段，以实现富有表现力的VTuber回复。",
  );

  return prompt.join("\n");
}
