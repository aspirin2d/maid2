import { Hono } from "hono";
import { z } from "zod";
import type { AppVariables } from "../types.js";
import { requireAuth } from "../middlewares/auth.js";
import { formatZodError } from "../validation.js";
import { env } from "../env.js";
import { stream } from "hono/streaming";

const ttsRoute = new Hono<{ Variables: AppVariables }>();

// Apply authentication middleware to all TTS routes
ttsRoute.use("/*", requireAuth);

// Request body validation schema
const ttsRequestSchema = z.object({
  text: z
    .string()
    .min(1, "Text is required")
    .max(600, "Text must not exceed 600 characters"),
  voice: z.string().min(1, "Voice is required"),
  model: z
    .string()
    .optional()
    .default("qwen3-tts-flash")
    .refine(
      (val) =>
        val === "qwen3-tts-flash" ||
        val.startsWith("qwen-tts") ||
        val.startsWith("qwen2-tts"),
      {
        message: "Model must be qwen3-tts-flash or from qwen-tts series",
      },
    ),
  language_type: z
    .enum([
      "Auto",
      "Chinese",
      "English",
      "German",
      "Italian",
      "Portuguese",
      "Spanish",
      "Japanese",
      "Korean",
      "French",
      "Russian",
    ])
    .optional()
    .default("Auto"),
  stream: z.boolean().optional().default(false),
});

// POST /api/v1/tts - Generate speech from text
ttsRoute.post("/", async (c) => {
  // Check if API key is configured
  if (!env.DASHSCOPE_API_KEY) {
    return c.json(
      {
        error:
          "DASHSCOPE_API_KEY is not configured. Please set it in your environment variables.",
      },
      500,
    );
  }

  // Parse and validate request body
  const body = await c.req.json();
  const parsed = ttsRequestSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: formatZodError(parsed.error) }, 400);
  }

  const { text, voice, model, language_type, stream: enableStream } = parsed.data;

  try {
    // Prepare request to Qwen TTS API
    const apiUrl =
      "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";

    const requestBody = {
      model,
      input: {
        text,
      },
      parameters: {
        voice,
        language_type,
      },
    };

    // Handle streaming response
    if (enableStream) {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.DASHSCOPE_API_KEY}`,
          "Content-Type": "application/json",
          "X-DashScope-SSE": "enable",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return c.json(
          {
            error: `Qwen TTS API error: ${response.statusText}`,
            details: errorText,
          },
          500,
        );
      }

      // Stream the response back to client
      return stream(c, async (stream) => {
        c.header("Content-Type", "text/event-stream");
        c.header("Cache-Control", "no-cache");
        c.header("Connection", "keep-alive");

        const reader = response.body?.getReader();
        if (!reader) {
          await stream.write("data: {\"error\": \"No response body\"}\n\n");
          return;
        }

        const decoder = new TextDecoder();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            await stream.write(chunk);
          }
        } catch (error) {
          console.error("Error streaming TTS response:", error);
          await stream.write(
            `data: ${JSON.stringify({ error: "Streaming error" })}\n\n`,
          );
        }
      });
    }

    // Handle non-streaming response
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.DASHSCOPE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return c.json(
        {
          error: `Qwen TTS API error: ${response.statusText}`,
          details: errorText,
        },
        500,
      );
    }

    const data = await response.json();

    // Return the response from Qwen TTS
    return c.json({
      audio_url: data.output?.audio?.url,
      finish_reason: data.output?.finish_reason,
      usage: data.usage,
    });
  } catch (error) {
    console.error("Error calling Qwen TTS API:", error);
    return c.json(
      {
        error: "Failed to generate speech",
        details: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});

// GET /api/v1/tts/voices - Get available voices (reference list)
ttsRoute.get("/voices", async (c) => {
  // Based on Qwen TTS documentation, common voices include:
  const voices = [
    { id: "Cherry", name: "Cherry (Female)", language: "Chinese/English" },
    { id: "Emily", name: "Emily (Female)", language: "Chinese/English" },
    { id: "Stella", name: "Stella (Female)", language: "Chinese/English" },
    { id: "Luna", name: "Luna (Female)", language: "Chinese/English" },
    { id: "Bella", name: "Bella (Female)", language: "Chinese/English" },
    { id: "Alice", name: "Alice (Female)", language: "Chinese/English" },
    { id: "Nancy", name: "Nancy (Female)", language: "Chinese/English" },
    { id: "William", name: "William (Male)", language: "Chinese/English" },
    { id: "Harry", name: "Harry (Male)", language: "Chinese/English" },
    { id: "Daniel", name: "Daniel (Male)", language: "Chinese/English" },
  ];

  return c.json({ voices });
});

export default ttsRoute;
