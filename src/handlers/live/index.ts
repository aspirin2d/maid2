import { z } from "zod";
import {
  registerStoryHandler,
  type HandlerConfig,
  type HandlerMetadata,
  type StoryContext,
  type StoryHandler,
} from "../index.js";
import { buildPrompt } from "./prompt-builder.js";
import { extractRequestText } from "./utils.js";
import {
  liveInputSchema,
  normalizeToEvent,
  extractEventText,
  type LiveEvent,
  type LiveInput,
} from "./events.js";

const clipSchema = z.object({
  body: z.string().describe("身体动作/姿势描"),
  face: z.string().describe("面部表情描述"),
  speech: z.string().describe("VTuber要说的文本内容"),
});

const outputSchema = z.object({
  clips: z.array(clipSchema).min(1).max(3).describe("VTuber回复的1-3个片段"),
});

const factory = (ctx: StoryContext, config?: HandlerConfig): StoryHandler => {
  let userInput: LiveInput | null = null;
  let normalizedEvent: LiveEvent | null = null;
  let assistantResponse = "";

  return {
    async init(input: any) {
      userInput = input;
      // Normalize input to event format for consistent processing
      normalizedEvent = normalizeToEvent(input);

      return {
        prompt: await buildPrompt(normalizedEvent, ctx, config),
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
      // Extract user message from the normalized event
      const userContent = normalizedEvent ? extractEventText(normalizedEvent) : null;

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
          "AI VTuber处理器，支持事件驱动输入（弹幕、礼物、节目切换等），使用中文回复，输出包含身体动作、面部表情和语音的1-3个片段",
        version: "2.0.0",
        inputSchema: liveInputSchema,
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
    "AI VTuber处理器，支持事件驱动输入（弹幕、礼物、节目切换等），使用中文回复，输出包含身体动作、面部表情和语音的1-3个片段",
  version: "2.0.0",
  inputSchema: liveInputSchema,
  outputSchema,
  capabilities: {
    supportsThinking: true,
    requiresHistory: true,
    supportsCaching: false,
  },
};

registerStoryHandler("live", factory, metadata);
