import { z } from "zod";
import {
  getMessagesByStory,
  bulkInsertMessages,
} from "../message.js";
import {
  registerStoryHandler,
  type StoryContext,
  type StoryHandler,
} from "./index.js";

const schema = z.object({
  answer: z.string().meta({ description: "Assistant's response." }),
});

function extractRequestText(input: unknown): string | null {
  if (typeof input === "string") {
    const trimmed = input.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (input && typeof input === "object") {
    const candidate =
      // loosely support multiple field names that the frontend might send
      (input as Record<string, unknown>).prompt ??
      (input as Record<string, unknown>).question ??
      (input as Record<string, unknown>).message ??
      (input as Record<string, unknown>).input;
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
    try {
      return JSON.stringify(input);
    } catch {
      return null;
    }
  }
  return null;
}

const renderPrompt = async (input: any, ctx: StoryContext) => {
  // Limit to last 50 messages for performance (prevents loading huge conversation histories)
  const rows = await getMessagesByStory(ctx.story, { lastN: 50 });

  const prompt = [
    "You are a helpful assistant, response user's question in JSON format",
    "",
    "## Chat history:",
  ];

  const chatHistory = rows.filter(
    (row) => row.role === "user" || row.role === "assistant",
  );

  if (chatHistory.length === 0) {
    prompt.push("(no previous conversation)");
  } else {
    for (const row of chatHistory) {
      const speaker = row.role === "user" ? "User" : "Assistant";
      prompt.push(`${speaker}: ${row.content}`);
    }
  }

  const request = extractRequestText(input);
  if (request) {
    prompt.push("", "## Current request:", request);
  }

  prompt.push("", "Respond with valid JSON matching the provided schema.");

  return prompt.join("\n");
};

const factory = (ctx: StoryContext): StoryHandler => {
  let userInput: any = null;
  let assistantResponse = "";

  return {
    async init(input: any) {
      userInput = input;
      return {
        prompt: await renderPrompt(input, ctx),
        schema,
      };
    },
    onStart() {
      return { event: "start", data: "stream-started" };
    },
    onContent(content) {
      assistantResponse += content;
      return { event: "delta", data: content };
    },
    onThinking(content) {
      return { event: "thinking", data: content };
    },
    async onFinish() {
      // Save user and assistant messages in a transaction
      const messages = [];

      // Add user message
      const userContent = extractRequestText(userInput);
      if (userContent) {
        messages.push({
          storyId: ctx.story,
          role: "user" as const,
          content: userContent,
        });
      }

      // Add assistant message
      if (assistantResponse.trim().length > 0) {
        messages.push({
          storyId: ctx.story,
          role: "assistant" as const,
          content: assistantResponse.trim(),
        });
      }

      if (messages.length > 0) {
        await bulkInsertMessages(messages);
      }

      return { event: "finish", data: "stream-finished" };
    },
  };
};

registerStoryHandler("simple", factory);
