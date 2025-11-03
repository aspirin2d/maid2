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
  body: z.string().describe("身体动作/姿势描"),
  face: z.string().describe("面部表情描述"),
  speech: z.string().describe("VTuber要说的文本内容"),
});

const outputSchema = z.object({
  clips: z.array(clipSchema).min(1).max(3).describe("VTuber回复的1-3个片段"),
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
    `你是一个AI VTuber角色。你的回复应该生动、富有表现力且自然。
对于每个回复，你必须生成1-3个片段。每个片段代表一个互动时刻，包含：
- body（身体）：你的身体动作或姿势的描述（尽量详细）
- face（表情）：你的面部表情的描述（尽量详细）
- speech（语音）：你在这个片段中说的文本内容

将较长的回复分解为多个片段（最多3个），以获得自然的节奏和表现力。
保持每个片段的对话内容简洁，不要太长。`;

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
        prompt.push("## 记忆上下文：");
        prompt.push("以下信息是从之前的对话中提取的：");
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

  prompt.push("## 聊天历史：");

  const chatHistory = rows.filter(
    (row) => row.role === "user" || row.role === "assistant",
  );

  if (chatHistory.length === 0) {
    prompt.push("（没有之前的对话）");
  } else {
    for (const row of chatHistory) {
      if (row.role === "user") {
        prompt.push(`用户: ${row.content}`);
      } else if (row.role === "assistant") {
        // Parse clips and extract speech
        try {
          const parsed = JSON.parse(row.content);
          if (parsed.clips && Array.isArray(parsed.clips)) {
            const speeches = parsed.clips
              .map((clip: any) => clip.speech)
              .filter(
                (speech: any) =>
                  typeof speech === "string" && speech.trim().length > 0,
              )
              .join("");
            if (speeches.length > 0) {
              prompt.push(`VTuber: ${speeches}`);
            }
          }
        } catch (error) {
          // If parsing fails, skip this message or show as-is
          console.error("Failed to parse assistant message:", error);
        }
      }
    }
  }

  if (request) {
    prompt.push("", "## 当前请求：", request);
  }

  prompt.push(
    "",
    "请使用与提供的架构匹配的有效JSON进行响应。",
    "生成1-3个包含body、face和speech字段的片段，以实现富有表现力的VTuber回复。",
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
          "AI VTuber处理器，使用中文回复，输出包含身体动作、面部表情和语音的1-3个片段",
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
    "AI VTuber处理器，使用中文回复，输出包含身体动作、面部表情和语音的1-3个片段",
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
