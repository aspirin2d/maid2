/**
 * Handler-specific input builders and output formatters for the CLI
 *
 * This module provides a clean separation between general story management
 * and handler-specific logic (input/output formatting).
 */

import { input, select } from "@inquirer/prompts";
import { requiredField } from "./lib.js";
import {
  createPrompt,
  useState,
  useKeypress,
  usePrefix,
  isEnterKey,
  isUpKey,
  isDownKey,
  ExitPromptError,
} from "@inquirer/core";

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

type LiveClip = {
  body?: string;
  face?: string;
  speech?: string;
  text?: string;
  content?: string;
  message?: string;
};

type LiveSpeechHotkeyHandler = () => Promise<void> | void;

let lastLiveSpeechClips: string[] = [];
let liveSpeechHotkeyHandler: LiveSpeechHotkeyHandler | null = null;
let isHotkeyRunning = false;

export function getLastLiveSpeechClips() {
  return lastLiveSpeechClips.slice();
}

function setLastLiveSpeechClips(clips: string[]) {
  lastLiveSpeechClips = clips;
}

export function clearLastLiveSpeechClips() {
  lastLiveSpeechClips = [];
}

export function setLiveSpeechHotkeyHandler(handler: LiveSpeechHotkeyHandler | null) {
  liveSpeechHotkeyHandler = handler;
}

async function triggerLiveSpeechHotkey() {
  if (!liveSpeechHotkeyHandler) {
    console.log("\nNo VTuber speech is available yet.");
    return;
  }

  if (isHotkeyRunning) {
    return;
  }

  isHotkeyRunning = true;
  try {
    await liveSpeechHotkeyHandler();
  } catch (error) {
    console.error(
      "Failed to generate speech:",
      error instanceof Error ? error.message : error,
    );
  } finally {
    isHotkeyRunning = false;
  }
}

/**
 * Simple choice for event selection
 */
interface EventChoice<T> {
  name: string;
  value: T;
}

/**
 * Config for event selection prompt
 */
interface EventSelectConfig<T> {
  message: string;
  choices: EventChoice<T>[];
}

// ============================================================================
// Custom Event Selection Prompt
// ============================================================================

/**
 * Custom prompt for event selection with number key shortcuts
 * Supports 1-9 keys for direct selection and 0 for the 10th item
 */
const rawEventSelectPrompt = createPrompt<string, EventSelectConfig<string>>(
  (config, done) => {
    const prefix = usePrefix({});
    const [cursor, setCursor] = useState(0);

    const clamp = (n: number) =>
      Math.max(0, Math.min(n, config.choices.length - 1));

    useKeypress((key, rl) => {
      if (isUpKey(key)) {
        setCursor(clamp(cursor - 1));
        return;
      }
      if (isDownKey(key)) {
        setCursor(clamp(cursor + 1));
        return;
      }

      const k = (key.name || "").toLowerCase();

      if (k === "g") {
        void (async () => {
          await triggerLiveSpeechHotkey();
          rl.write("");
        })();
        return;
      }

      // Handle number key selection (1-9 and 0 for 10)
      if (k >= "0" && k <= "9") {
        const num = k === "0" ? 10 : parseInt(k, 10);
        const targetIndex = num - 1;
        if (targetIndex >= 0 && targetIndex < config.choices.length) {
          done(config.choices[targetIndex].value);
        }
        return;
      }

      if (isEnterKey(key)) {
        const choice = config.choices[cursor];
        if (choice) {
          done(choice.value);
        }
        return;
      }

      if (k === "escape") {
        // throw new ExitPromptError();
      }
    });

    const message = config.message;
    const lines = config.choices.map((choice, index) => {
      const caret = index === cursor ? "❯" : " ";
      const indexNum = index + 1;
      return `${caret} [${indexNum}] ${choice.name}`;
    });

    const help = `↑/↓ move   1-9/0=select   Enter=confirm   g=Speech TTS   Esc=cancel`;

    return [`${prefix} ${message}`, ...lines, "", help].join("\n");
  },
);

/**
 * Event selection prompt with type safety
 */
function eventSelectPrompt<T extends string>(
  config: EventSelectConfig<T>,
): Promise<T> & { cancel: () => void } {
  return rawEventSelectPrompt(
    config as EventSelectConfig<string>,
  ) as unknown as Promise<T> & { cancel: () => void };
}

// ============================================================================
// Live Handler - Input Builder
// ============================================================================

/**
 * Build event-based input for the live handler
 * Provides an interactive menu to create various event types
 */
async function buildLiveHandlerInput(): Promise<unknown> {
  try {
    const eventType = await eventSelectPrompt({
      message: "Choose event type",
      choices: [
        { name: "User chat", value: "user_chat" },
        { name: "Gift event", value: "gift_event" },
        { name: "Program event", value: "program_event" },
        { name: "Clear story (/clear)", value: "command_clear" },
        { name: "Exit chat (/exit)", value: "command_exit" },
      ],
    });

    // Simple text - just return the text directly (backward compatible)
    if (eventType === "command_clear") {
      return "/clear";
    }
    if (eventType === "command_exit") {
      return "/exit";
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

      default:
        // Fallback to simple text
        const text = await input({
          message: "Enter your message",
          validate: requiredField("Message"),
        });
        return text;
    }
  } catch (error) {
    if (error instanceof ExitPromptError) {
      // Treat Escape/cancel as leaving chat so callers can return to the story list.
      return "/exit";
    }
    throw error;
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
  if (!raw) {
    clearLastLiveSpeechClips();
    return false;
  }

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    clearLastLiveSpeechClips();
    return false;
  }

  if (!parsed || typeof parsed !== "object") {
    clearLastLiveSpeechClips();
    return false;
  }

  const data = parsed as { clips?: LiveClip[] };
  if (!Array.isArray(data.clips) || data.clips.length === 0) {
    clearLastLiveSpeechClips();
    return false;
  }

  const speechSnippets = data.clips
    .map((clip) => clip?.speech || clip?.text || clip?.content || clip?.message)
    .filter((speech): speech is string => Boolean(speech && speech.trim().length > 0))
    .map((speech) => speech.trim());

  if (speechSnippets.length > 0) {
    setLastLiveSpeechClips(speechSnippets);
  } else {
    clearLastLiveSpeechClips();
  }

  console.log("\nVTuber Response:");
  data.clips.forEach((clip, index) => {
    if (data.clips!.length > 1) {
      console.log(`\n  Clip ${index + 1}/${data.clips!.length}:`);
    }
    if (clip.body) {
      console.log(`    Body: ${clip.body}`);
    }
    if (clip.face) {
      console.log(`    Face: ${clip.face}`);
    }
    if (clip.speech) {
      console.log(`    Speech: ${clip.speech}`);
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

  console.log(`\nMessage: ${message}`);
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
