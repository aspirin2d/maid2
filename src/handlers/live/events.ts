import { z } from "zod";

/**
 * Event-based input schema for the live handler
 * Simplified to three core event types for live streaming scenarios
 */

// ==================== Event Type Definitions ====================

/**
 * User message events - all user input messages
 * Includes regular chat, bullet chat (danmaku), and any text from viewers
 */
const userChatEventSchema = z.object({
  type: z.literal("user_chat"),
  data: z.object({
    message: z.string().describe("The user's message content"),
    username: z.string().describe("Username of the sender").optional(),
    timestamp: z.number().describe("Timestamp of the message").optional(),
  }),
});

/**
 * Gift/donation events - when viewers send gifts or donations
 */
const giftEventSchema = z.object({
  type: z.literal("gift_event"),
  data: z.object({
    username: z.string().describe("Username of the sender"),
    giftName: z.string().describe("Name of the gift"),
    giftCount: z.number().default(1).describe("Number of gifts sent"),
    giftValue: z.number().describe("Value or cost of the gift").optional(),
    message: z.string().describe("Optional message with the gift").optional(),
  }),
});

/**
 * Program transition events - live stream state changes
 */
const programEventSchema = z.object({
  type: z.literal("program_event"),
  data: z.object({
    action: z
      .enum(["start", "finish", "pause", "resume"])
      .describe("Program action type"),
    programId: z.string().describe("Unique identifier for the program").optional(),
    programName: z.string().describe("Name of the program"),
    programType: z
      .enum(["singing", "chatting", "gaming", "drawing", "other"])
      .describe("Type of program")
      .optional(),
    duration: z.number().describe("Duration in seconds (for finish events)").optional(),
    metadata: z.record(z.string(), z.unknown()).describe("Additional program metadata").optional(),
  }),
});

/**
 * Simple text input for backward compatibility
 */
const simpleTextEventSchema = z.object({
  type: z.literal("simple_text"),
  data: z.object({
    text: z.string().describe("Simple text input"),
  }),
});

// ==================== Union Schema ====================

/**
 * Main event schema - union of core event types
 */
export const liveEventSchema = z.discriminatedUnion("type", [
  userChatEventSchema,
  giftEventSchema,
  programEventSchema,
  simpleTextEventSchema,
]);

export type LiveEvent = z.infer<typeof liveEventSchema>;

// ==================== Input Schema ====================

/**
 * Complete input schema that supports both new event format and legacy formats
 */
export const liveInputSchema = z.union([
  // New event-based format
  liveEventSchema,
  // Legacy simple string format
  z.string(),
  // Legacy object format with various field names
  z.object({
    prompt: z.string().optional(),
    question: z.string().optional(),
    message: z.string().optional(),
    input: z.string().optional(),
  }),
]);

export type LiveInput = z.infer<typeof liveInputSchema>;

// ==================== Helper Functions ====================

/**
 * Normalize legacy input formats to event format
 *
 * Converts various input formats (string, legacy object, or event) into
 * a standardized LiveEvent format for consistent processing.
 *
 * @param input - Raw input in any supported format
 * @returns Normalized LiveEvent
 */
export function normalizeToEvent(input: LiveInput): LiveEvent {
  // Already an event - return as-is
  if (typeof input === "object" && "type" in input) {
    return input as LiveEvent;
  }

  // Simple string - convert to user_chat event
  if (typeof input === "string") {
    return {
      type: "user_chat",
      data: {
        message: input,
      },
    };
  }

  // Legacy object format - extract text and convert to user_chat event
  const text =
    input.prompt ?? input.question ?? input.message ?? input.input ?? "";

  return {
    type: "user_chat",
    data: {
      message: text,
    },
  };
}

/**
 * Extract displayable text from any event for chat history
 *
 * Converts events into human-readable text suitable for saving as
 * user messages in the chat history.
 *
 * @param event - The event to extract text from
 * @returns Formatted text representation, or null if not applicable
 */
export function extractEventText(event: LiveEvent): string | null {
  switch (event.type) {
    case "user_chat":
      return event.data.message;

    case "gift_event": {
      const giftMsg = `[礼物] ${event.data.username} 送出了 ${event.data.giftCount}x ${event.data.giftName}`;
      return event.data.message ? `${giftMsg}: ${event.data.message}` : giftMsg;
    }

    case "program_event": {
      const actionMap = {
        start: "开始",
        finish: "结束",
        pause: "暂停",
        resume: "恢复",
      };
      const action = actionMap[event.data.action] || event.data.action;
      return `[节目${action}] ${event.data.programName}`;
    }

    case "simple_text":
      return event.data.text;

    default:
      return null;
  }
}

/**
 * Get context description for an event to include in the prompt
 *
 * Generates detailed context strings for each event type, optimized
 * for inclusion in LLM prompts to provide rich contextual information.
 *
 * @param event - The event to generate context for
 * @returns Formatted context string
 */
export function getEventContext(event: LiveEvent): string {
  switch (event.type) {
    case "user_chat": {
      const userPrefix = event.data.username
        ? `${event.data.username}: `
        : "用户: ";
      return `${userPrefix}${event.data.message}`;
    }

    case "gift_event":
      return buildGiftContext(event);

    case "program_event":
      return buildProgramContext(event);

    case "simple_text":
      return event.data.text;

    default:
      return JSON.stringify(event);
  }
}

// ==================== Event Context Builders ====================
// Helper functions for building detailed context strings for complex events

/**
 * Build detailed context for gift/donation events
 */
function buildGiftContext(event: Extract<LiveEvent, { type: "gift_event" }>): string {
  let context = `[收到礼物] ${event.data.username} 送出了 ${event.data.giftCount}x ${event.data.giftName}`;

  if (event.data.giftValue) {
    context += ` (价值: ${event.data.giftValue})`;
  }

  if (event.data.message) {
    context += `\n留言: ${event.data.message}`;
  }

  return context;
}

/**
 * Build detailed context for program transition events
 */
function buildProgramContext(event: Extract<LiveEvent, { type: "program_event" }>): string {
  const actionText = {
    start: "开始",
    finish: "结束",
    pause: "暂停",
    resume: "恢复",
  }[event.data.action];

  let context = `[节目${actionText}] ${event.data.programName}`;

  if (event.data.programType) {
    const typeText = {
      singing: "唱歌",
      chatting: "聊天",
      gaming: "游戏",
      drawing: "绘画",
      other: "其他",
    }[event.data.programType];
    context += ` (类型: ${typeText})`;
  }

  if (event.data.duration && event.data.action === "finish") {
    const minutes = Math.floor(event.data.duration / 60);
    const seconds = event.data.duration % 60;
    context += ` (时长: ${minutes > 0 ? `${minutes}分` : ""}${seconds}秒)`;
  }

  return context;
}
