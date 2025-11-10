import { Ollama } from "ollama";
import OpenAI from "openai";
import { env } from "./env.js";

/**
 * Provider types for different LLM operations
 *
 * IMPORTANT: Text embeddings are ONLY provided by Dashscope.
 *
 * - ChatProvider: Providers that support chat completions and structured output ("openai" | "ollama")
 * - EmbeddingProvider: Provider for text embeddings ("dashscope" ONLY)
 * - Provider: Legacy type alias for ChatProvider (for backwards compatibility)
 *
 * Architecture:
 * - Chat/Streaming: OpenAI or Ollama
 * - Text Embeddings: Dashscope only
 */

// Chat providers (for LLM completions and streaming)
export type ChatProvider = "openai" | "ollama";

// Embedding provider (text embeddings) - ONLY Dashscope
export type EmbeddingProvider = "dashscope";

// Legacy type alias for backwards compatibility with chat operations
export type Provider = ChatProvider;

// Shared embedding configuration
export const EMBEDDING_DIMS = 1536;

// LLM model configuration (can be overridden via environment variables)
export const OPENAI_MODEL = env.OPENAI_MODEL ?? "gpt-4.1";
export const OLLAMA_MODEL =
  env.OLLAMA_MODEL ?? "alibayram/Qwen3-30B-A3B-Instruct-2507";
export const OLLAMA_KEEP_ALIVE = env.OLLAMA_KEEP_ALIVE ?? "24h"; // e.g. "30m", "2h", "-1"

// Dashscope embedding configuration (Dashscope is the ONLY provider for text embeddings)
export const DASHSCOPE_EMBEDDING_MODEL =
  env.DASHSCOPE_EMBEDDING_MODEL ?? "text-embedding-v4";
export const DASHSCOPE_EMBEDDING_URL =
  env.DASHSCOPE_EMBEDDING_URL ||
  "https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding";

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

/**
 * Call Dashscope (Aliyun) text embedding API
 *
 * Dashscope text embedding API supports batch processing (max 10 texts per request)
 * and optional parameters for better semantic search results.
 *
 * @param texts - Array of texts to embed (max 10 per batch, auto-batched by caller)
 * @param dims - Embedding dimensions (default 1536, supports 512, 1024, 1536)
 * @param options - Optional parameters for fine-tuning embeddings
 * @param options.text_type - Optimizes embedding for specific use case:
 *   - "query": Use for search queries (user input to find documents)
 *   - "document": Use for documents to be searched (stored content)
 * @param options.instruct - Custom instruction to guide embedding generation
 *   - Example: "Represent this sentence for retrieval:"
 * @returns Array of embedding vectors (one per input text)
 */
async function callDashscopeEmbedding(
  texts: string[],
  dims = EMBEDDING_DIMS,
  options?: {
    text_type?: "query" | "document";
    instruct?: string;
  },
): Promise<number[][]> {
  if (!env.DASHSCOPE_API_KEY) {
    throw new Error(
      "DASHSCOPE_API_KEY environment variable is not set. Please add it to your .env file.",
    );
  }

  // Dashscope API endpoint
  const endpoint = `${DASHSCOPE_EMBEDDING_URL}`;

  // Build request body with optional parameters
  const requestBody: any = {
    model: DASHSCOPE_EMBEDDING_MODEL,
    input: {
      texts: texts,
    },
    parameters: {
      dimension: dims,
    },
  };

  // Add optional text_type if provided
  if (options?.text_type) {
    requestBody.parameters.text_type = options.text_type;
  }

  // Add optional instruct if provided
  if (options?.instruct) {
    requestBody.input.instruct = options.instruct;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.DASHSCOPE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Dashscope API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();

  // Parse response and extract embeddings
  // Dashscope response format: { output: { embeddings: [{ embedding: number[], text_index: number }] } }
  if (!data.output?.embeddings || !Array.isArray(data.output.embeddings)) {
    throw new Error(
      `Invalid Dashscope response format: ${JSON.stringify(data)}`,
    );
  }

  // Sort by text_index to maintain order and extract embeddings
  const embeddings = data.output.embeddings
    .sort((a: any, b: any) => (a.text_index || 0) - (b.text_index || 0))
    .map((item: any) => item.embedding);

  return embeddings;
}

/**
 * Options for Dashscope text embedding (optional)
 *
 * These parameters help optimize embeddings for specific use cases:
 * - text_type: "query" for user search queries, "document" for stored documents
 * - instruct: Custom instruction to guide the embedding model
 *
 * Example usage:
 * ```typescript
 * // For storing documents
 * await embedText("dashscope", content, 1536, { text_type: "document" });
 *
 * // For user queries
 * await embedText("dashscope", userQuery, 1536, { text_type: "query" });
 *
 * // With custom instruction
 * await embedText("dashscope", text, 1536, {
 *   text_type: "document",
 *   instruct: "Represent this for semantic search:"
 * });
 * ```
 */
export interface DashscopeEmbeddingOptions {
  text_type?: "query" | "document";
  instruct?: string;
}

/**
 * Generate text embeddings using Dashscope
 *
 * IMPORTANT: This function ONLY supports Dashscope. OpenAI and Ollama are not supported for embeddings.
 *
 * @param provider - Must be "dashscope"
 * @param texts - Array of texts to embed
 * @param dims - Embedding dimensions (default 1536, supports 512, 1024, 1536)
 * @param options - Optional Dashscope embedding parameters
 * @returns Array of embedding vectors
 */
export async function embedTexts(
  provider: EmbeddingProvider,
  texts: string[],
  dims = EMBEDDING_DIMS,
  options?: DashscopeEmbeddingOptions,
): Promise<number[][]> {
  // Dashscope has a max batch size of 10 for text-embedding-v3/v4
  const BATCH_SIZE = 10;
  const allEmbeddings: number[][] = [];

  // Process in batches of 10
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const batchEmbeddings = await callDashscopeEmbedding(
      batch,
      dims,
      options,
    );
    allEmbeddings.push(...batchEmbeddings);
  }

  return allEmbeddings;
}

export async function embedText(
  provider: EmbeddingProvider,
  text: string,
  dims = EMBEDDING_DIMS,
  options?: DashscopeEmbeddingOptions,
): Promise<number[]> {
  const embeddings = await embedTexts(provider, [text], dims, options);
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
