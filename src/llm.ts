import { Ollama } from "ollama";
import OpenAI from "openai";
import { env } from "./env.js";

export type Provider = "openai" | "ollama";

// Shared embedding configuration
export const EMBEDDING_DIMS = 1536;

// LLM model configuration (can be overridden via environment variables)
export const OPENAI_MODEL = env.OPENAI_MODEL ?? "gpt-4.1";
export const OLLAMA_MODEL =
  env.OLLAMA_MODEL ?? "alibayram/Qwen3-30B-A3B-Instruct-2507";
export const OPENAI_EMBEDDING_MODEL =
  env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
export const OLLAMA_EMBEDDING_MODEL =
  env.OLLAMA_EMBEDDING_MODEL ?? "qwen3-embedding";

export const OLLAMA_KEEP_ALIVE = env.OLLAMA_KEEP_ALIVE ?? "24h"; // e.g. "30m", "2h", "-1"

export function getOpenAI(): OpenAI {
  if (!env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY environment variable is not set. Please add it to your .env file.",
    );
  }
  return new OpenAI({
    apiKey: env.OPENAI_API_KEY,
  });
}

export function getOllama(): Ollama {
  const host = env.OLLAMA_BASE_URL || "http://localhost:11434";
  return new Ollama({ host });
}

export function fitToDims(vec: number[], dims = EMBEDDING_DIMS): number[] {
  if (vec.length === dims) return vec;
  if (vec.length > dims) return vec.slice(0, dims);
  const out = vec.slice();
  while (out.length < dims) out.push(0);
  return out;
}

export async function embedTexts(
  provider: Provider,
  texts: string[],
  dims = EMBEDDING_DIMS,
): Promise<number[][]> {
  if (provider === "openai") {
    const client = getOpenAI();
    const res = await client.embeddings.create({
      model: OPENAI_EMBEDDING_MODEL,
      input: texts,
      dimensions: dims,
    });
    return res.data.map((d) => d.embedding);
  }

  const client = getOllama();
  const res = await client.embed({
    model: OLLAMA_EMBEDDING_MODEL,
    input: texts,
    keep_alive: OLLAMA_KEEP_ALIVE,
  });
  return res.embeddings.map((e) => fitToDims(e, dims));
}

export async function embedText(
  provider: Provider,
  text: string,
  dims = EMBEDDING_DIMS,
): Promise<number[]> {
  const embeddings = await embedTexts(provider, [text], dims);
  if (embeddings.length === 0) {
    throw new Error(
      "Failed to generate embedding: embedTexts returned empty array",
    );
  }
  return embeddings[0];
}

// ============
// Streaming IO
// ============

export type StreamEvent =
  | { type: "delta"; data: string }
  | { type: "refusal"; data: string }
  | { type: "thinking"; data: string }
  | { type: "error"; data: string }
  | { type: "done"; data: "" };

export interface StructuredFormat {
  name: string;
  schema: Record<string, any>;
}

export async function* streamOpenAIStructured(args: {
  prompt: string;
  format: StructuredFormat;
}): AsyncGenerator<StreamEvent> {
  const { prompt, format } = args;
  const client = getOpenAI();
  const stream = client.responses.stream({
    model: OPENAI_MODEL,
    input: prompt,
    text: { format: { ...format, strict: true, type: "json_schema" } },
  });
  for await (const event of stream) {
    if (event.type === "response.output_text.delta") {
      yield { type: "delta", data: event.delta };
    }
    if (event.type === "response.refusal.delta") {
      yield { type: "refusal", data: event.delta };
    }
    if (event.type === "error") {
      yield { type: "error", data: String(event.message) };
      return;
    }
    if (event.type === "response.completed") {
      yield { type: "done", data: "" };
      return;
    }
  }
}

export async function* streamOllamaStructured(args: {
  prompt: string;
  format: StructuredFormat;
}): AsyncGenerator<StreamEvent> {
  const { prompt, format } = args;
  const client = getOllama();
  const stream = await client.chat({
    model: OLLAMA_MODEL,
    messages: [{ role: "user", content: prompt }],
    stream: true,
    // Pass through experimental flag; ignored by models that don't support it
    options: {
      temperature: 0.7,
      top_p: 0.8,
      top_k: 20,
    },
    format: format.schema,
    keep_alive: OLLAMA_KEEP_ALIVE,
  });
  for await (const chunk of stream) {
    if (chunk && typeof chunk === "object" && "error" in chunk) {
      yield { type: "error", data: String(chunk.error) };
    }
    if (chunk && typeof chunk === "object" && "done" in chunk && chunk.done) {
      yield { type: "done", data: "" };
      return;
    }

    if (chunk?.message?.content) {
      yield { type: "delta", data: chunk.message.content };
    }
  }
}

// ================
// Direct Response
// ================

export async function parseOpenAIStructured(args: {
  prompt: string;
  format: StructuredFormat;
}): Promise<string> {
  const { prompt, format } = args;
  const client = getOpenAI();
  const response = await client.responses.parse({
    model: OPENAI_MODEL,
    input: prompt,
    text: { format: { ...format, strict: true, type: "json_schema" } },
  });

  // Note: refusal property removed as it's not in OpenAI SDK response type
  // If response.output_text is empty, it might indicate a refusal
  if (!response.output_text) {
    throw new Error("OpenAI returned empty response");
  }

  return response.output_text;
}

export async function parseOllamaStructured(args: {
  prompt: string;
  format: StructuredFormat;
}): Promise<string> {
  const { prompt, format } = args;
  const client = getOllama();
  const response = await client.chat({
    model: OLLAMA_MODEL,
    messages: [{ role: "user", content: prompt }],
    stream: false,
    options: {
      temperature: 0.7,
      top_p: 0.8,
      top_k: 20,
    },
    format: format.schema,
    keep_alive: OLLAMA_KEEP_ALIVE,
  });

  if (!response.message?.content) {
    throw new Error("Ollama returned empty response");
  }

  return response.message.content;
}
