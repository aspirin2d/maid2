import { z } from "zod";
import { getMessagesByStory } from "../message.js";
import {
  registerStoryHandler,
  type StoryContext,
  type StoryHandler,
  type HandlerConfig,
  type HandlerMetadata,
} from "./index.js";

const schema = z.object({
  answer: z.string().meta({ description: "Assistant's response." }),
});

const inputSchema = z.union([
  z.string(),
  z.object({
    prompt: z.string().optional(),
    question: z.string().optional(),
    message: z.string().optional(),
    input: z.string().optional(),
  }),
]);

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

const renderPrompt = async (
  input: any,
  ctx: StoryContext,
  config?: HandlerConfig,
) => {
  // Use config to determine message limit, default to 50
  const messageLimit = (config?.messageLimit as number | undefined) ?? 50;
  const systemPrompt =
    (config?.systemPrompt as string | undefined) ??
    "You are a helpful assistant, response user's question in JSON format";

  const rows = await getMessagesByStory(ctx.story, { lastN: messageLimit });

  const prompt = [systemPrompt, "", "## Chat history:"];

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

const factory = (ctx: StoryContext, config?: HandlerConfig): StoryHandler => {
  let userInput: any = null;
  let assistantResponse = "";

  return {
    async init(input: any) {
      userInput = input;
      return {
        prompt: await renderPrompt(input, ctx, config),
        schema,
      };
    },
    onStart() {
      // No return value - decoupled from SSE
    },
    onContent(content) {
      assistantResponse += content;
      return content; // Return processed content as-is
    },
    onThinking(content) {
      return content; // Return thinking content as-is
    },
    async onFinish() {
      // Return messages to persist - persistence handled by adapter
      const userContent = extractRequestText(userInput);

      return {
        userMessage: userContent ?? undefined,
        assistantMessage:
          assistantResponse.trim().length > 0
            ? assistantResponse.trim()
            : undefined,
      };
    },
    getMetadata(): HandlerMetadata {
      return {
        name: "simple",
        description:
          "Simple conversational handler with chat history and configurable system prompt",
        version: "1.0.0",
        inputSchema,
        outputSchema: schema,
        capabilities: {
          supportsThinking: true,
          requiresHistory: true,
          supportsCaching: false,
        },
      };
    },
  };
};

const metadata: HandlerMetadata = {
  name: "simple",
  description:
    "Simple conversational handler with chat history and configurable system prompt",
  version: "1.0.0",
  inputSchema,
  outputSchema: schema,
  capabilities: {
    supportsThinking: true,
    requiresHistory: true,
    supportsCaching: false,
  },
};

registerStoryHandler("simple", factory, metadata);
