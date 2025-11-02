import { z } from "zod";
import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import { streamOpenAIStructured, streamOllamaStructured } from "../llm.js";
import type { StoryHandler } from "../story-handler/index.js";
import { toData } from "../validation.js";

export type Provider = "openai" | "ollama";

export interface StreamingOptions {
  provider: Provider;
  handler: StoryHandler;
  prompt: string;
  schema: z.ZodType;
}

/**
 * Streaming adapter that handles both OpenAI and Ollama providers
 * Reduces endpoint complexity by encapsulating streaming logic and error handling
 */
export async function streamWithAdapter(
  c: Context,
  options: StreamingOptions,
) {
  const { provider, handler, prompt, schema } = options;

  if (provider === "openai") {
    return streamSSE(c, async (output) => {
      try {
        // Send start event
        const startEvent = handler.onStart();
        await output.writeSSE({
          event: startEvent.event,
          data: toData(startEvent.data),
        });

        // Stream content
        for await (const ev of streamOpenAIStructured({
          prompt,
          format: { name: "output", schema: z.toJSONSchema(schema) },
        })) {
          if (ev.type === "delta") {
            const deltaEvent = handler.onContent(ev.data);
            await output.writeSSE({
              event: deltaEvent.event,
              data: toData(deltaEvent.data),
            });
          }
          if (ev.type === "error") {
            await output.writeSSE({ event: "error", data: ev.data });
            break;
          }
          if (ev.type === "done") break;
        }

        // Send finish event
        const finishEvent = await handler.onFinish();
        await output.writeSSE({
          event: finishEvent.event,
          data: toData(finishEvent.data),
        });
      } catch (e) {
        console.error("OpenAI streaming error:", e);
        await output.writeSSE({
          event: "finish",
          data: toData({
            done: true,
            error: e instanceof Error ? e.message : String(e),
          }),
        });
      }
    });
  }

  // Ollama provider
  return streamSSE(c, async (output) => {
    try {
      // Send start event
      const startEvent = handler.onStart();
      await output.writeSSE({
        event: startEvent.event,
        data: toData(startEvent.data),
      });

      // Stream content
      for await (const ev of streamOllamaStructured({
        prompt,
        format: { name: "output", schema: z.toJSONSchema(schema) },
      })) {
        if (ev.type === "thinking") {
          const thinkingEvent = handler.onThinking(ev.data);
          await output.writeSSE({
            event: thinkingEvent.event,
            data: toData(thinkingEvent.data),
          });
        }
        if (ev.type === "delta") {
          const deltaEvent = handler.onContent(ev.data);
          await output.writeSSE({
            event: deltaEvent.event,
            data: toData(deltaEvent.data),
          });
        }
        if (ev.type === "error") {
          await output.writeSSE({ event: "error", data: ev.data });
        }
        if (ev.type === "done") break;
      }

      // Send finish event
      const finishEvent = await handler.onFinish();
      await output.writeSSE({
        event: finishEvent.event,
        data: toData(finishEvent.data),
      });
    } catch (e) {
      console.error("Ollama streaming error:", e);
      await output.writeSSE({
        event: "error",
        data: toData(e instanceof Error ? e.message : String(e)),
      });
    }
  });
}
