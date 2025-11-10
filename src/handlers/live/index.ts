import { z } from "zod";
import type { JsonValue } from "../../types.js";
import {
  registerStoryHandler,
  type HandlerConfig,
  type HandlerMetadata,
  type StoryContext,
  type StoryHandler,
  type HandlerResult,
} from "../index.js";
import { buildPrompt } from "./prompt-builder.js";
import {
  liveInputSchema,
  normalizeToEvent,
  extractEventText,
  type LiveEvent,
  type LiveInput,
} from "./events.js";
import { parseLLMResponse, validateInput } from "./utils.js";

/**
 * Schema for a single VTuber response clip
 * Each clip contains body movement, facial expression, and speech
 */
const clipSchema = z.object({
  body: z.string().describe("身体动作/姿势描述"),
  face: z.string().describe("面部表情描述"),
  speech: z.string().describe("VTuber要说的文本内容"),
});

/**
 * Output schema for VTuber responses
 * Generates 1-3 clips for expressive communication
 */
const outputSchema = z.object({
  clips: z.array(clipSchema).min(1).max(3).describe("VTuber回复的1-3个片段"),
});

type OutputData = z.infer<typeof outputSchema>;

/**
 * Metadata for the live handler
 * Defined once at the top level for use in both factory and registration
 */
const metadata: HandlerMetadata = {
  name: "live",
  description:
    "AI VTuber处理器，支持事件驱动输入（弹幕、礼物、节目切换等），使用中文回复，输出包含身体动作、面部表情和语音的1-3个片段",
  version: "2.1.0",
  inputSchema: liveInputSchema,
  outputSchema,
  capabilities: {
    supportsThinking: true,
    requiresHistory: true,
    supportsCaching: false,
  },
};

/**
 * Build metadata object for persistence
 * Includes parse result and error information if applicable
 */
function buildResponseMetadata(
  parseResult: ReturnType<typeof parseLLMResponse<typeof outputSchema>>,
): Record<string, JsonValue> | undefined {
  const metadata: Record<string, JsonValue> = {};

  if (parseResult.success && parseResult.data) {
    metadata.parsedOutput = parseResult.data;
  } else if (parseResult.error) {
    console.error('[LiveHandler] Failed to parse LLM response:', parseResult.error);
    metadata.parseError = parseResult.error;

    // Log detailed error information for debugging
    if (parseResult.errorDetails) {
      console.error('[LiveHandler] Error details:', {
        stage: parseResult.errorDetails.stage,
        cleanedTextLength: parseResult.cleanedText.length,
        cleanedTextPreview: parseResult.cleanedText.slice(0, 200),
      });
    }
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

/**
 * Determine message content for persistence
 * Prefers validated parsed output, falls back to cleaned text
 */
function getMessageContent(
  parseResult: ReturnType<typeof parseLLMResponse<typeof outputSchema>>,
): string | undefined {
  if (parseResult.success && parseResult.data) {
    return JSON.stringify(parseResult.data);
  }
  return parseResult.cleanedText || undefined;
}

/**
 * Factory function that creates a live handler instance
 * @param ctx - Story context containing user and story information
 * @param config - Optional handler configuration
 */
const factory = (ctx: StoryContext, config?: HandlerConfig): StoryHandler => {
  // Handler state
  let validatedInput: LiveInput | null = null;
  let normalizedEvent: LiveEvent | null = null;
  let assistantResponse = "";

  return {
    async init(input: unknown) {
      // Early input validation
      const validationResult = validateInput(input, liveInputSchema);
      if (!validationResult.success) {
        console.error('[LiveHandler] Input validation failed:', validationResult.error);
        throw new Error(validationResult.error);
      }

      validatedInput = validationResult.data;

      // Normalize input to event format for consistent processing
      normalizedEvent = normalizeToEvent(validatedInput);

      return {
        prompt: await buildPrompt(normalizedEvent, ctx, config),
        schema: outputSchema,
      };
    },

    onStart(): void {
      // Reset state for new stream
      assistantResponse = "";
    },

    onContent(content: string): string {
      assistantResponse += content;
      return content;
    },

    onThinking(content: string): string {
      // Pass through thinking content as-is
      return content;
    },

    async onFinish(): Promise<HandlerResult> {
      // Extract user message from the normalized event
      const userContent = normalizedEvent ? extractEventText(normalizedEvent) : null;

      // Parse and validate LLM response
      const parseResult = parseLLMResponse(assistantResponse, outputSchema);

      // Build metadata with parse result
      const resultMetadata = buildResponseMetadata(parseResult);

      // Determine message content for persistence
      const messageContent = getMessageContent(parseResult);

      return {
        userMessage: userContent ?? undefined,
        assistantMessage: messageContent,
        metadata: resultMetadata,
      };
    },

    getMetadata(): HandlerMetadata {
      return metadata;
    },
  };
};

// Register the live handler
registerStoryHandler("live", factory, metadata);
