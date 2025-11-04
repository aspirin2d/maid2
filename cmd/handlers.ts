/**
 * Handler-specific input builders and output formatters for the CLI
 *
 * This module provides a clean separation between general story management
 * and handler-specific logic (input/output formatting).
 */

import { input, select } from "@inquirer/prompts";
import { requiredField } from "./lib.js";

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Handler input builder function
 * Returns the input data for a specific handler
 */
type HandlerInputBuilder = () => Promise<unknown>;

/**
 * Handler output formatter function
 * Formats and displays handler-specific output
 * Returns true if handled, false if should fall back to raw display
 */
type HandlerOutputFormatter = (payload: string) => boolean;

// ============================================================================
// Live Handler - Input Builder
// ============================================================================

/**
 * Build event-based input for the live handler
 * Provides an interactive menu to create various event types
 */
async function buildLiveHandlerInput(): Promise<unknown> {
  const eventType = await select({
    message: "Choose event type",
    choices: [
      { name: "💬 Simple text (just type a message)", value: "simple_text" },
      { name: "👤 User chat (regular conversation)", value: "user_chat" },
      { name: "🎯 Bullet chat (danmaku/弹幕)", value: "bullet_chat" },
      { name: "📺 Program event (start/finish segment)", value: "program_event" },
      { name: "🎁 Gift event (donations/gifts)", value: "gift_event" },
      { name: "❤️ User interaction (follow/subscribe)", value: "user_interaction" },
      { name: "⚙️ System event (technical notification)", value: "system_event" },
      { name: "😊 Emotion event (mood change)", value: "emotion_event" },
    ],
    default: "simple_text",
  });

  // Simple text - just return the text directly (backward compatible)
  if (eventType === "simple_text") {
    const text = await input({
      message: "Enter your message",
      validate: requiredField("Message"),
    });
    return text;
  }

  // Build event-specific data
  switch (eventType) {
    case "user_chat": {
      const message = await input({
        message: "Chat message",
        validate: requiredField("Message"),
      });
      const username = await input({
        message: "Username (optional, press Enter to skip)",
      });
      return {
        type: "user_chat",
        data: {
          message,
          ...(username.trim() && { username: username.trim() }),
          timestamp: Date.now(),
        },
      };
    }

    case "bullet_chat": {
      const message = await input({
        message: "Bullet chat message",
        validate: requiredField("Message"),
      });
      const username = await input({
        message: "Username (optional, press Enter to skip)",
      });
      const position = await select({
        message: "Display position",
        choices: [
          { name: "Scroll", value: "scroll" },
          { name: "Top", value: "top" },
          { name: "Bottom", value: "bottom" },
        ],
        default: "scroll",
      });
      return {
        type: "bullet_chat",
        data: {
          message,
          ...(username.trim() && { username: username.trim() }),
          position,
          timestamp: Date.now(),
        },
      };
    }

    case "program_event": {
      const action = await select({
        message: "Program action",
        choices: [
          { name: "Start", value: "start" },
          { name: "Finish", value: "finish" },
          { name: "Pause", value: "pause" },
          { name: "Resume", value: "resume" },
        ],
      });
      const programName = await input({
        message: "Program name",
        validate: requiredField("Program name"),
      });
      const programType = await select({
        message: "Program type (optional)",
        choices: [
          { name: "Skip", value: "" },
          { name: "Singing (唱歌)", value: "singing" },
          { name: "Chatting (聊天)", value: "chatting" },
          { name: "Gaming (游戏)", value: "gaming" },
          { name: "Drawing (绘画)", value: "drawing" },
          { name: "Other (其他)", value: "other" },
        ],
      });
      const data: any = {
        action,
        programName,
        ...(programType && { programType }),
      };

      if (action === "finish") {
        const durationInput = await input({
          message: "Duration in seconds (optional, press Enter to skip)",
        });
        if (durationInput.trim()) {
          const duration = parseInt(durationInput, 10);
          if (!isNaN(duration)) {
            data.duration = duration;
          }
        }
      }

      return {
        type: "program_event",
        data,
      };
    }

    case "gift_event": {
      const username = await input({
        message: "Sender username",
        validate: requiredField("Username"),
      });
      const giftName = await input({
        message: "Gift name",
        validate: requiredField("Gift name"),
      });
      const giftCountInput = await input({
        message: "Gift count",
        default: "1",
        validate: (value) => {
          const num = parseInt(value, 10);
          if (isNaN(num) || num < 1) {
            return "Please enter a valid number (minimum 1)";
          }
          return true;
        },
      });
      const giftMessage = await input({
        message: "Message with gift (optional, press Enter to skip)",
      });
      const giftValueInput = await input({
        message: "Gift value (optional, press Enter to skip)",
      });

      const data: any = {
        username,
        giftName,
        giftCount: parseInt(giftCountInput, 10),
        ...(giftMessage.trim() && { message: giftMessage.trim() }),
      };

      if (giftValueInput.trim()) {
        const value = parseFloat(giftValueInput);
        if (!isNaN(value)) {
          data.giftValue = value;
        }
      }

      return {
        type: "gift_event",
        data,
      };
    }

    case "user_interaction": {
      const action = await select({
        message: "Interaction type",
        choices: [
          { name: "Follow (关注)", value: "follow" },
          { name: "Subscribe (订阅)", value: "subscribe" },
          { name: "Like (点赞)", value: "like" },
          { name: "Share (分享)", value: "share" },
        ],
      });
      const username = await input({
        message: "Username",
        validate: requiredField("Username"),
      });
      const data: any = {
        action,
        username,
      };

      if (action === "subscribe") {
        const tier = await input({
          message: "Subscription tier (optional, press Enter to skip)",
        });
        const monthsInput = await input({
          message: "Subscription months (optional, press Enter to skip)",
        });

        if (tier.trim()) {
          data.tier = tier.trim();
        }
        if (monthsInput.trim()) {
          const months = parseInt(monthsInput, 10);
          if (!isNaN(months)) {
            data.months = months;
          }
        }
      }

      return {
        type: "user_interaction",
        data,
      };
    }

    case "system_event": {
      const eventTypeStr = await input({
        message: "Event type (e.g., stream_start, technical_issue)",
        validate: requiredField("Event type"),
      });
      const message = await input({
        message: "System message (optional, press Enter to skip)",
      });
      const severity = await select({
        message: "Severity",
        choices: [
          { name: "Info", value: "info" },
          { name: "Warning", value: "warning" },
          { name: "Error", value: "error" },
        ],
        default: "info",
      });
      return {
        type: "system_event",
        data: {
          eventType: eventTypeStr,
          ...(message.trim() && { message: message.trim() }),
          severity,
        },
      };
    }

    case "emotion_event": {
      const emotion = await input({
        message: "Emotion (e.g., happy, excited, tired, surprised)",
        validate: requiredField("Emotion"),
      });
      const intensityInput = await input({
        message: "Intensity 0-1 (optional, press Enter to skip)",
      });
      const trigger = await input({
        message: "Trigger/reason (optional, press Enter to skip)",
      });
      const durationInput = await input({
        message: "Duration in seconds (optional, press Enter to skip)",
      });

      const data: any = {
        emotion,
      };

      if (intensityInput.trim()) {
        const intensity = parseFloat(intensityInput);
        if (!isNaN(intensity) && intensity >= 0 && intensity <= 1) {
          data.intensity = intensity;
        }
      }
      if (trigger.trim()) {
        data.trigger = trigger.trim();
      }
      if (durationInput.trim()) {
        const duration = parseInt(durationInput, 10);
        if (!isNaN(duration)) {
          data.duration = duration;
        }
      }

      return {
        type: "emotion_event",
        data,
      };
    }

    default:
      // Fallback to simple text
      const text = await input({
        message: "Enter your message",
        validate: requiredField("Message"),
      });
      return text;
  }
}

// ============================================================================
// Live Handler - Output Formatter
// ============================================================================

/**
 * Format and display live handler output (VTuber clips)
 * Returns true if successfully formatted, false otherwise
 */
function formatLiveHandlerOutput(payload: string): boolean {
  const raw = payload.trim();
  if (!raw) return false;

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return false;
  }

  if (!parsed || typeof parsed !== "object") {
    return false;
  }

  const data = parsed as { clips?: Array<{ body?: string; face?: string; speech?: string }> };
  if (!Array.isArray(data.clips) || data.clips.length === 0) {
    return false;
  }

  console.log("\n🎬 VTuber Response:");
  data.clips.forEach((clip, index) => {
    if (data.clips!.length > 1) {
      console.log(`\n  Clip ${index + 1}/${data.clips!.length}:`);
    }
    if (clip.body) {
      console.log(`    💃 Body: ${clip.body}`);
    }
    if (clip.face) {
      console.log(`    😊 Face: ${clip.face}`);
    }
    if (clip.speech) {
      console.log(`    💬 Speech: ${clip.speech}`);
    }
  });

  return true;
}

// ============================================================================
// Simple Handler - Output Formatter
// ============================================================================

/**
 * Format and display simple handler output
 * Returns true if successfully formatted, false otherwise
 */
function formatSimpleHandlerOutput(payload: string): boolean {
  const raw = payload.trim();
  if (!raw) return false;

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return false;
  }

  if (!parsed || typeof parsed !== "object") {
    return false;
  }

  const message = (parsed as { response?: unknown }).response;
  if (typeof message !== "string" || message.trim().length === 0) {
    return false;
  }

  console.log(`\n📝 Message: ${message}`);
  return true;
}

// ============================================================================
// Handler Registry
// ============================================================================

/**
 * Registry of handler-specific input builders
 */
const INPUT_BUILDERS: Record<string, HandlerInputBuilder> = {
  live: buildLiveHandlerInput,
  // Add more handlers here as needed
};

/**
 * Registry of handler-specific output formatters
 */
const OUTPUT_FORMATTERS: Record<string, HandlerOutputFormatter> = {
  live: formatLiveHandlerOutput,
  simple: formatSimpleHandlerOutput,
  // Add more handlers here as needed
};

// ============================================================================
// Public API
// ============================================================================

/**
 * Build input for a specific handler
 * Falls back to simple text input if handler not found
 */
export async function buildHandlerInput(handler: string): Promise<unknown> {
  const builder = INPUT_BUILDERS[handler];
  if (builder) {
    return await builder();
  }

  // Default: simple text input
  return await input({
    message: "You",
  });
}

/**
 * Format and display handler-specific output
 * Returns true if handled, false if should fall back to raw display
 */
export function formatHandlerOutput(handler: string, payload: string): boolean {
  const formatter = OUTPUT_FORMATTERS[handler];
  if (formatter) {
    return formatter(payload);
  }

  return false;
}
