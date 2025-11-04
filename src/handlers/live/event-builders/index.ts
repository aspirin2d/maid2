/**
 * Event-specific prompt builders
 * Each event type has its own dedicated builder for customized prompts
 */

import type { StoryContext, HandlerConfig } from "../../index.js";
import type { LiveEvent } from "../events.js";
import type { EventPromptResult } from "./types.js";

// Export types
export type { EventPromptResult, EventPromptBuilder } from "./types.js";

// Import all event builders
import { buildUserChatPrompt } from "./user-chat.js";
import { buildBulletChatPrompt } from "./bullet-chat.js";
import { buildProgramEventPrompt } from "./program-event.js";
import { buildGiftEventPrompt } from "./gift-event.js";
import { buildUserInteractionPrompt } from "./user-interaction.js";
import { buildSystemEventPrompt } from "./system-event.js";
import { buildEmotionEventPrompt } from "./emotion-event.js";
import { buildSimpleTextPrompt } from "./simple-text.js";

// Export individual builders
export { buildUserChatPrompt } from "./user-chat.js";
export { buildBulletChatPrompt } from "./bullet-chat.js";
export { buildProgramEventPrompt } from "./program-event.js";
export { buildGiftEventPrompt } from "./gift-event.js";
export { buildUserInteractionPrompt } from "./user-interaction.js";
export { buildSystemEventPrompt } from "./system-event.js";
export { buildEmotionEventPrompt } from "./emotion-event.js";
export { buildSimpleTextPrompt } from "./simple-text.js";

/**
 * Main dispatcher - routes to event-specific prompt builder
 * This is the primary entry point for building event-specific prompts
 */
export async function buildEventSpecificPrompt(
  event: LiveEvent,
  ctx: StoryContext,
  config?: HandlerConfig,
): Promise<EventPromptResult> {
  switch (event.type) {
    case "user_chat":
      return buildUserChatPrompt(event, ctx, config);
    case "bullet_chat":
      return buildBulletChatPrompt(event, ctx, config);
    case "program_event":
      return buildProgramEventPrompt(event, ctx, config);
    case "gift_event":
      return buildGiftEventPrompt(event, ctx, config);
    case "user_interaction":
      return buildUserInteractionPrompt(event, ctx, config);
    case "system_event":
      return buildSystemEventPrompt(event, ctx, config);
    case "emotion_event":
      return buildEmotionEventPrompt(event, ctx, config);
    case "simple_text":
      return buildSimpleTextPrompt(event, ctx, config);
    default:
      // TypeScript should ensure we never get here
      const _exhaustive: never = event;
      throw new Error(`Unknown event type: ${JSON.stringify(event)}`);
  }
}
