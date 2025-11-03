import { z } from "zod";
import { embedTexts } from "../llm.js";
import { searchSimilarMemories } from "../memory.js";
import { getMessagesByStory } from "../message.js";
import {
  registerStoryHandler,
  type HandlerConfig,
  type HandlerMetadata,
  type StoryContext,
  type StoryHandler,
} from "./index.js";

const outputSchema = z.object({
  response: z.string().meta({ description: "Assistant's response." }),
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
    "You are a helpful assistant, answer user's question in JSON's 'response' field.";

  const rows = await getMessagesByStory(ctx.story, { lastN: messageLimit });

  const prompt = [systemPrompt, ""];

  // Retrieve relevant memories for context
  const request = extractRequestText(input);
  if (request && ctx.provider) {
    try {
      // Generate embedding for the current request
      const [queryEmbedding] = await embedTexts(ctx.provider, [request]);

      // Search for similar memories (top 5 most relevant)
      const memories = await searchSimilarMemories(queryEmbedding, {
        userId: ctx.userId,
        topK: 5,
        minSimilarity: 0.5, // Only include memories with >50% similarity
      });

      // Add memory context to prompt if we found relevant memories
      if (memories.length > 0) {
        prompt.push("## Memory Context:");
        prompt.push(
          "The following information has been extracted from previous conversations:",
        );
        prompt.push("");

        for (const { memory } of memories) {
          const categoryLabel =
            memory.category?.replace(/_/g, " ").toLowerCase() || "other";
          prompt.push(`- [${categoryLabel}] ${memory.content}`);
        }
        prompt.push("");
      }
    } catch (error) {
      // Silently fail memory retrieval to not break the handler
      console.error("Failed to retrieve memories for context:", error);
    }
  }

  prompt.push("## Chat history:");

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

  if (request) {
    prompt.push("", "## Current request:", request);
  }

  prompt.push("", "Respond with valid JSON matching the provided schema.");
  console.log(prompt.join("\n"));
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
        schema: outputSchema,
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
          "Simple conversational handler with chat history, memory context retrieval, and configurable system prompt",
        version: "1.1.0",
        inputSchema,
        outputSchema,
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
    "Simple conversational handler with chat history, memory context retrieval, and configurable system prompt",
  version: "1.1.0",
  inputSchema,
  outputSchema,
  capabilities: {
    supportsThinking: true,
    requiresHistory: true,
    supportsCaching: false,
  },
};

registerStoryHandler("simple", factory, metadata);
