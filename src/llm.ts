import { Ollama } from "ollama";
import OpenAI from "openai";
import { env } from "./env.js";

export type Provider = "openai" | "ollama" | "dashscope";

// Shared embedding configuration
export const EMBEDDING_DIMS = 1536;

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second
const MAX_RETRY_DELAY = 16000; // 16 seconds
const MAX_TEXT_LENGTH = 8000; // Conservative limit for embedding texts

/**
 * Error types for embedding operations
 */
export class EmbeddingError extends Error {
  constructor(
    message: string,
    public provider: Provider,
    public isRetryable: boolean = false,
    public cause?: Error,
  ) {
    super(message);
    this.name = "EmbeddingError";
  }
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay with jitter
 */
function getRetryDelay(attempt: number): number {
  const exponentialDelay = Math.min(
    INITIAL_RETRY_DELAY * Math.pow(2, attempt),
    MAX_RETRY_DELAY,
  );
  // Add jitter: random value between 0.5x and 1.5x of the delay
  const jitter = 0.5 + Math.random();
  return Math.floor(exponentialDelay * jitter);
}

/**
 * Retry wrapper for async operations
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  provider: Provider,
  context: string,
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      // Determine if error is retryable
      const isRetryable = isRetryableError(error, provider);

      if (!isRetryable || attempt === MAX_RETRIES - 1) {
        // Don't retry non-retryable errors or if we've exhausted retries
        console.error(
          `${provider} ${context} failed after ${attempt + 1} attempt(s):`,
          error,
        );
        throw new EmbeddingError(
          `${provider} ${context} failed: ${error instanceof Error ? error.message : String(error)}`,
          provider,
          false,
          error as Error,
        );
      }

      // Calculate delay with exponential backoff
      const delay = getRetryDelay(attempt);
      console.warn(
        `${provider} ${context} failed (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${delay}ms...`,
        error instanceof Error ? error.message : String(error),
      );

      await sleep(delay);
    }
  }

  // This should never be reached due to the throw above, but TypeScript needs it
  throw new EmbeddingError(
    `${provider} ${context} failed after ${MAX_RETRIES} retries`,
    provider,
    false,
    lastError,
  );
}

/**
 * Determine if an error is retryable based on error type and provider
 */
function isRetryableError(error: unknown, provider: Provider): boolean {
  if (!error) return false;

  const errorMessage =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  // Network errors are always retryable
  if (
    errorMessage.includes("network") ||
    errorMessage.includes("timeout") ||
    errorMessage.includes("econnreset") ||
    errorMessage.includes("econnrefused") ||
    errorMessage.includes("etimedout") ||
    errorMessage.includes("fetch failed")
  ) {
    return true;
  }

  // Rate limiting errors are retryable
  if (
    errorMessage.includes("rate limit") ||
    errorMessage.includes("429") ||
    errorMessage.includes("too many requests")
  ) {
    return true;
  }

  // Temporary server errors are retryable
  if (
    errorMessage.includes("502") ||
    errorMessage.includes("503") ||
    errorMessage.includes("504") ||
    errorMessage.includes("500")
  ) {
    return true;
  }

  // Provider-specific retryable errors
  if (provider === "openai") {
    // OpenAI SDK specific errors
    if (
      error &&
      typeof error === "object" &&
      "status" in error
    ) {
      const status = (error as any).status;
      // Retry on 429 (rate limit), 500, 502, 503, 504
      return status === 429 || (status >= 500 && status < 600);
    }
  }

  if (provider === "dashscope") {
    // Dashscope API specific errors
    if (errorMessage.includes("throttling") || errorMessage.includes("flowlimit")) {
      return true;
    }
  }

  if (provider === "ollama") {
    // Ollama specific errors
    if (errorMessage.includes("connection refused") || errorMessage.includes("unavailable")) {
      return true;
    }
  }

  // Default to non-retryable for unknown errors
  return false;
}

/**
 * Validate input texts for embedding generation
 */
function validateEmbeddingInputs(texts: string[], provider: Provider): void {
  if (!Array.isArray(texts)) {
    throw new EmbeddingError(
      "embedTexts requires an array of strings",
      provider,
      false,
    );
  }

  if (texts.length === 0) {
    throw new EmbeddingError(
      "embedTexts requires at least one text to embed",
      provider,
      false,
    );
  }

  for (let i = 0; i < texts.length; i++) {
    const text = texts[i];

    if (typeof text !== "string") {
      throw new EmbeddingError(
        `Text at index ${i} is not a string (type: ${typeof text})`,
        provider,
        false,
      );
    }

    if (!text.trim()) {
      throw new EmbeddingError(
        `Text at index ${i} is empty or contains only whitespace`,
        provider,
        false,
      );
    }

    if (text.length > MAX_TEXT_LENGTH) {
      throw new EmbeddingError(
        `Text at index ${i} exceeds maximum length of ${MAX_TEXT_LENGTH} characters (length: ${text.length})`,
        provider,
        false,
      );
    }
  }
}

// LLM model configuration (can be overridden via environment variables)
export const OPENAI_MODEL = env.OPENAI_MODEL ?? "gpt-4o";
export const OLLAMA_MODEL =
  env.OLLAMA_MODEL ?? "alibayram/Qwen3-30B-A3B-Instruct-2507";
export const OPENAI_EMBEDDING_MODEL =
  env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
export const OLLAMA_EMBEDDING_MODEL =
  env.OLLAMA_EMBEDDING_MODEL ?? "qwen3-embedding";
export const DASHSCOPE_EMBEDDING_MODEL =
  env.DASHSCOPE_EMBEDDING_MODEL ?? "text-embedding-v4";
export const DASHSCOPE_EMBEDDING_URL =
  env.DASHSCOPE_EMBEDDING_URL ||
  "https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding";

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

/**
 * Call Dashscope (Aliyun) text embedding API
 * @param texts - Array of texts to embed (max 10 for batch)
 * @param dims - Embedding dimensions (default 1536)
 * @param options - Optional parameters
 * @param options.text_type - Text type: "query" for search queries, "document" for documents to be searched
 * @param options.instruct - Custom instruction for the embedding model
 * @returns Array of embedding vectors
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

export interface DashscopeEmbeddingOptions {
  text_type?: "query" | "document";
  instruct?: string;
}

export async function embedTexts(
  provider: Provider,
  texts: string[],
  dims = EMBEDDING_DIMS,
  options?: DashscopeEmbeddingOptions,
): Promise<number[][]> {
  // Validate inputs before attempting to embed
  validateEmbeddingInputs(texts, provider);

  if (provider === "openai") {
    return await withRetry(
      async () => {
        const client = getOpenAI();
        const res = await client.embeddings.create({
          model: OPENAI_EMBEDDING_MODEL,
          input: texts,
          dimensions: dims,
        });

        // Validate response
        if (!res.data || res.data.length === 0) {
          throw new Error("OpenAI returned empty embeddings array");
        }

        if (res.data.length !== texts.length) {
          throw new Error(
            `OpenAI returned ${res.data.length} embeddings but expected ${texts.length}`,
          );
        }

        return res.data.map((d) => d.embedding);
      },
      provider,
      "embedding generation",
    );
  }

  if (provider === "dashscope") {
    // Dashscope has a max batch size of 10 for text-embedding-v3/v4
    const BATCH_SIZE = 10;
    const allEmbeddings: number[][] = [];

    // Process in batches of 10 with retry for each batch
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const batchIndex = Math.floor(i / BATCH_SIZE);

      const batchEmbeddings = await withRetry(
        async () => {
          const embeddings = await callDashscopeEmbedding(batch, dims, options);

          // Validate batch response
          if (!embeddings || embeddings.length === 0) {
            throw new Error("Dashscope returned empty embeddings array");
          }

          if (embeddings.length !== batch.length) {
            throw new Error(
              `Dashscope batch ${batchIndex} returned ${embeddings.length} embeddings but expected ${batch.length}`,
            );
          }

          return embeddings;
        },
        provider,
        `embedding batch ${batchIndex + 1} (texts ${i + 1}-${Math.min(i + BATCH_SIZE, texts.length)})`,
      );

      allEmbeddings.push(...batchEmbeddings);
    }

    return allEmbeddings;
  }

  // Ollama provider
  return await withRetry(
    async () => {
      const client = getOllama();
      const res = await client.embed({
        model: OLLAMA_EMBEDDING_MODEL,
        input: texts,
        keep_alive: OLLAMA_KEEP_ALIVE,
      });

      // Validate response
      if (!res.embeddings || res.embeddings.length === 0) {
        throw new Error("Ollama returned empty embeddings array");
      }

      if (res.embeddings.length !== texts.length) {
        throw new Error(
          `Ollama returned ${res.embeddings.length} embeddings but expected ${texts.length}`,
        );
      }

      return res.embeddings.map((e) => fitToDims(e, dims));
    },
    provider,
    "embedding generation",
  );
}

export async function embedText(
  provider: Provider,
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
