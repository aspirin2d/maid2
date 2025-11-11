/**
 * Input builder for the live handler
 * Provides an interactive menu to create various event types
 */

import { input, select } from "@inquirer/prompts";
import { ExitPromptError } from "@inquirer/core";
import { requiredField } from "../../lib.js";
import { eventSelectPrompt } from "./prompt.js";

/**
 * Build event-based input for the live handler
 * Provides an interactive menu to create various event types
 */
export async function buildLiveHandlerInput(): Promise<unknown> {
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
