import { z } from "zod";
import {
  registerStoryHandler,
  type HandlerConfig,
  type HandlerMetadata,
  type StoryContext,
  type StoryHandler,
} from "../index.js";
import { buildPrompt } from "./prompt-builder.js";
import {
  liveInputSchema,
  normalizeToEvent,
  extractEventText,
  type LiveEvent,
  type LiveInput,
} from "./events.js";

/**
 * Schema for a single VTuber response clip
 * Each clip contains body movement, facial expression, and speech
 */
const clipSchema = z.object({
  body: z.string().describe("身体动作/姿势描"),
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

/**
 * Remove markdown code fences from a string
 * Handles ```json, ```, and trailing ``` markers
 */
function removeMarkdownCodeFences(text: string): string {
  let trimmed = text.trim();

  // Remove leading code fence
  if (trimmed.startsWith('```json')) {
    trimmed = trimmed.slice(7); // Remove ```json
  } else if (trimmed.startsWith('```')) {
    trimmed = trimmed.slice(3); // Remove ```
  }

  // Remove trailing code fence
  if (trimmed.endsWith('```')) {
    trimmed = trimmed.slice(0, -3); // Remove trailing ```
  }

  return trimmed.trim();
}

/**
 * Result of parsing LLM response
 */
interface ParseResult {
  /** Successfully parsed and validated output */
  success: boolean;
  /** Parsed output (only if success is true) */
  data?: z.infer<typeof outputSchema>;
  /** Cleaned response text (markdown fences removed) */
  cleanedText: string;
  /** Error message (only if success is false) */
  error?: string;
}

/**
 * Parse and validate LLM response against output schema
 * @param rawResponse - Raw LLM response text (may contain markdown fences)
 * @returns ParseResult with success status, data, and error info
 */
function parseLLMResponse(rawResponse: string): ParseResult {
  // Step 1: Clean markdown fences
  const cleanedText = removeMarkdownCodeFences(rawResponse);

  if (cleanedText.length === 0) {
    return {
      success: false,
      cleanedText: '',
      error: 'Empty response after cleaning markdown fences',
    };
  }

  // Step 2: Parse JSON
  let jsonData: unknown;
  try {
    jsonData = JSON.parse(cleanedText);
  } catch (error) {
    return {
      success: false,
      cleanedText,
      error: `JSON parse error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  // Step 3: Validate against schema
  try {
    const validatedData = outputSchema.parse(jsonData);
    return {
      success: true,
      data: validatedData,
      cleanedText,
    };
  } catch (error) {
    return {
      success: false,
      cleanedText,
      error: `Schema validation error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Metadata for the live handler
 * Defined once at the top level for use in both factory and registration
 */
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

/**
 * Factory function that creates a live handler instance
 * @param ctx - Story context containing user and story information
 * @param config - Optional handler configuration
 */
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

      // Parse and validate LLM response
      const parseResult = parseLLMResponse(assistantResponse);

      // Build metadata with parse result
      const metadata: Record<string, any> = {};
      if (parseResult.success && parseResult.data) {
        metadata.parsedOutput = parseResult.data;
      } else if (parseResult.error) {
        console.error('Failed to parse LLM response:', parseResult.error);
        metadata.parseError = parseResult.error;
      }

      // Determine message content:
      // - Use validated parsed output (re-serialized) if available
      // - Otherwise use cleaned text (markdown fences removed)
      const messageContent = parseResult.success && parseResult.data
        ? JSON.stringify(parseResult.data)
        : (parseResult.cleanedText || undefined);

      return {
        userMessage: userContent ?? undefined,
        assistantMessage: messageContent,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      };
    },
    getMetadata(): HandlerMetadata {
      return metadata;
    },
  };
};

// Register the live handler
registerStoryHandler("live", factory, metadata);
