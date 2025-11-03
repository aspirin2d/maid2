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

const clipSchema = z.object({
  body: z.string().describe("Description of body movement/gesture (e.g., 'wave', 'nod', 'lean forward', 'idle')"),
  face: z.string().describe("Description of facial expression (e.g., 'smile', 'surprised', 'thinking', 'neutral')"),
  speech: z.string().describe("Text to be spoken by the vtuber"),
});

const outputSchema = z.object({
  clips: z.array(clipSchema).min(1).max(3).describe("1-3 clips for the vtuber response"),
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
  const messageLimit = (config?.messageLimit as number | undefined) ?? 50;
  const systemPrompt =
    (config?.systemPrompt as string | undefined) ??
    `You are an AI VTuber character. Your responses should be engaging, expressive, and natural.
For each response, you must generate 1-3 clips. Each clip represents a moment of interaction with:
- body: A description of your body movement or gesture (e.g., "wave", "nod enthusiastically", "lean forward", "idle", "shrug")
- face: A description of your facial expression (e.g., "bright smile", "surprised eyes wide", "thoughtful look", "neutral", "playful wink")
- speech: The text you speak in this clip

Break longer responses into multiple clips (max 3) for natural pacing and expressiveness.
Keep speech segments conversational and not too long per clip.`;

  const rows = await getMessagesByStory(ctx.story, { lastN: messageLimit });

  const prompt = [systemPrompt, ""];

  // Retrieve relevant memories for context
  const request = extractRequestText(input);
  if (request && ctx.provider) {
    try {
      const [queryEmbedding] = await embedTexts(ctx.provider, [request]);
      const memories = await searchSimilarMemories(queryEmbedding, {
        userId: ctx.userId,
        topK: 5,
        minSimilarity: 0.5,
      });

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
      const speaker = row.role === "user" ? "User" : "VTuber";
      prompt.push(`${speaker}: ${row.content}`);
    }
  }

  if (request) {
    prompt.push("", "## Current request:", request);
  }

  prompt.push(
    "",
    "Respond with valid JSON matching the provided schema.",
    "Generate 1-3 clips with body, face, and speech fields for an expressive VTuber response.",
  );

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
      return content;
    },
    onThinking(content) {
      return content;
    },
    async onFinish() {
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
        name: "live",
        description:
          "AI VTuber handler that responds with 1-3 clips containing body movements, facial expressions, and speech",
        version: "1.0.0",
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
  name: "live",
  description:
    "AI VTuber handler that responds with 1-3 clips containing body movements, facial expressions, and speech",
  version: "1.0.0",
  inputSchema,
  outputSchema,
  capabilities: {
    supportsThinking: true,
    requiresHistory: true,
    supportsCaching: false,
  },
};

registerStoryHandler("live", factory, metadata);
