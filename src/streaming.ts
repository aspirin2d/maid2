import { z } from "zod";
import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import { streamOpenAIStructured, streamOllamaStructured } from "./llm.js";
import type { StoryHandler } from "./handlers/index.js";
import { bulkInsertMessages } from "./message.js";

export type LlmProvider = "openai" | "ollama";

export interface StreamingOptions {
  llmProvider: LlmProvider;
  handler: StoryHandler;
  prompt: string;
  schema: z.ZodType;
  storyId: number;
}

// Internal event type for unified streaming
type ProviderEvent =
  | { type: "delta"; data: string }
  | { type: "thinking"; data: string }
  | { type: "error"; data: string }
  | { type: "done" };

/**
 * Provider-agnostic stream generator
 * Abstracts away provider-specific streaming implementations
 */
async function* createProviderStream(
  llmProvider: LlmProvider,
  prompt: string,
  schema: z.ZodType,
): AsyncGenerator<ProviderEvent> {
  const format = { name: "output", schema: z.toJSONSchema(schema) };

  if (llmProvider === "openai") {
    for await (const ev of streamOpenAIStructured({ prompt, format })) {
      yield ev as ProviderEvent;
    }
  } else {
    // Ollama provider
    for await (const ev of streamOllamaStructured({ prompt, format })) {
      yield ev as ProviderEvent;
    }
  }
}

/**
 * Unified streaming adapter that handles both OpenAI and Ollama providers
 * Eliminates code duplication by using a provider-agnostic orchestrator
 * Separates handler lifecycle from SSE protocol concerns
 * Handles persistence in adapter layer instead of in handlers
 */
export async function streamWithAdapter(c: Context, options: StreamingOptions) {
  const { llmProvider, handler, prompt, schema, storyId } = options;

  return streamSSE(c, async (output) => {
    let streamError: Error | null = null;

    try {
      // Handler lifecycle: start
      handler.onStart();
      await output.writeSSE({
        event: "start",
        data: "stream-started",
      });

      // Stream content through provider-agnostic generator
      try {
        for await (const ev of createProviderStream(
          llmProvider,
          prompt,
          schema,
        )) {
          if (ev.type === "thinking") {
            const processedContent = handler.onThinking(ev.data);
            await output.writeSSE({
              event: "thinking",
              data: processedContent,
            });
          }

          if (ev.type === "delta") {
            const processedContent = handler.onContent(ev.data);
            await output.writeSSE({
              event: "delta",
              data: processedContent,
            });
          }

          if (ev.type === "error") {
            // Provider returned an error event
            await output.writeSSE({ event: "error", data: ev.data });
            streamError = new Error(ev.data);
            break;
          }

          if (ev.type === "done") break;
        }
      } catch (streamErr) {
        // Error during streaming (network, provider error, etc.)
        const errorMessage = streamErr instanceof Error
          ? streamErr.message
          : String(streamErr);

        console.error(`${llmProvider} streaming error:`, streamErr);

        await output.writeSSE({
          event: "error",
          data: errorMessage,
        });

        streamError = streamErr instanceof Error
          ? streamErr
          : new Error(errorMessage);
      }

      // Handler lifecycle: finish - returns messages to persist
      // Only persist if there was no streaming error
      if (!streamError) {
        try {
          const result = await handler.onFinish();

          // Persistence layer - decoupled from handler logic
          const messages = [];
          if (result.userMessage) {
            messages.push({
              storyId,
              role: "user" as const,
              content: result.userMessage,
            });
          }
          if (result.assistantMessage) {
            messages.push({
              storyId,
              role: "assistant" as const,
              content: result.assistantMessage,
            });
          }

          if (messages.length > 0) {
            await bulkInsertMessages(messages);
          }
        } catch (persistErr) {
          // Error during persistence - log but don't fail the stream
          console.error(`${llmProvider} message persistence error:`, persistErr);

          await output.writeSSE({
            event: "error",
            data: `Failed to save messages: ${persistErr instanceof Error ? persistErr.message : String(persistErr)}`,
          });
        }
      }

      // Always send finish event to properly close the stream
      await output.writeSSE({
        event: "finish",
        data: "stream-finished",
      });
    } catch (e) {
      // Unexpected error in adapter logic
      console.error(`${llmProvider} adapter error:`, e);

      await output.writeSSE({
        event: "error",
        data: `Unexpected error: ${e instanceof Error ? e.message : String(e)}`,
      });

      await output.writeSSE({
        event: "finish",
        data: "stream-finished",
      });
    }
  });
}
