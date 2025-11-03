// Central place for story types and handler registry function
import type { ZodType } from "zod";
import type { JsonValue } from "../types.js";

// Minimal JSON Schema alias to avoid importing heavy schema libs in handlers
export type JSONSchema = Record<string, JsonValue>;

// Per-request context provided to handler factories
export interface StoryContext {
  story: number;
  provider?: "openai" | "ollama";
}

// Handler configuration - can be stored per-story
export interface HandlerConfig {
  [key: string]: JsonValue;
}

// Handler metadata for discovery and documentation
export interface HandlerMetadata {
  name: string;
  description: string;
  version?: string;
  inputSchema?: ZodType;  // What inputs does this handler accept?
  outputSchema?: ZodType;  // What does it output to the LLM?
  capabilities?: {
    supportsThinking?: boolean;
    supportsCaching?: boolean;
    requiresHistory?: boolean;
  };
}

export type StoryEventName =
  | "start"
  | "delta"
  | "thinking"
  | "finish"
  | "error";

export type StoryEvent = { event: StoryEventName; data: string };

// Result from handler finish - decoupled from SSE
export interface HandlerResult {
  userMessage?: string;
  assistantMessage?: string;
  metadata?: Record<string, JsonValue>;
}

// Instance API for a story handler. Context is provided by a factory per request.
export interface StoryHandler {
  // Render prompt and JSON Schema (as JSON text or object) from input
  // Optionally return a bypass StoryEvent to skip LLM streaming.
  init(input: any): Promise<{ prompt: string; schema: ZodType } | null>;

  // Lifecycle hooks - return pure data (decoupled from SSE protocol)
  onStart(): void;
  onContent(content: string): string;  // Returns processed content
  onThinking(content: string): string; // Returns processed thinking text
  onFinish(): Promise<HandlerResult>;  // Returns messages to persist

  // Optional metadata for introspection
  getMetadata?(): HandlerMetadata;
}

// Constructor signature for handlers that require per-request context
export type StoryHandlerFactory = (
  ctx: StoryContext,
  config?: HandlerConfig
) => StoryHandler;

// ======================
// Handler registry (global)
// ======================
interface HandlerRegistryEntry {
  factory: StoryHandlerFactory;
  metadata?: HandlerMetadata;
}

const handlers = new Map<string, HandlerRegistryEntry>();

/**
 * Register a story handler with optional metadata
 * Validates the handler factory at registration time
 */
export function registerStoryHandler(
  type: string,
  factory: StoryHandlerFactory,
  metadata?: HandlerMetadata,
) {
  // Validate factory signature
  if (typeof factory !== "function") {
    throw new Error(
      `Handler factory for "${type}" must be a function, got ${typeof factory}`,
    );
  }

  // Validate factory implementation by creating a test instance
  try {
    const testCtx: StoryContext = { story: 0, provider: "openai" };
    const handler = factory(testCtx);

    const requiredMethods: (keyof StoryHandler)[] = [
      "init",
      "onStart",
      "onContent",
      "onThinking",
      "onFinish",
    ];

    for (const method of requiredMethods) {
      if (typeof handler[method] !== "function") {
        throw new Error(
          `Handler "${type}" missing required method: ${String(method)}`,
        );
      }
    }
  } catch (error) {
    throw new Error(
      `Failed to validate handler "${type}": ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  handlers.set(type, { factory, metadata });
}

export function clearStoryHandlers() {
  handlers.clear();
}

export function getStoryHandler(
  name: string,
  ctx: StoryContext,
  config?: HandlerConfig,
): StoryHandler | undefined {
  const entry = handlers.get(name);
  if (!entry) return undefined;
  return entry.factory(ctx, config);
}

export function listStoryHandlers(): string[] {
  return Array.from(handlers.keys());
}

/**
 * Get metadata for a specific handler
 */
export function getHandlerMetadata(name: string): HandlerMetadata | undefined {
  const entry = handlers.get(name);
  if (!entry) return undefined;

  // Try to get metadata from registration or from handler instance
  if (entry.metadata) return entry.metadata;

  // Fallback: instantiate handler and check if it provides metadata
  try {
    const testCtx: StoryContext = { story: 0, provider: "openai" };
    const handler = entry.factory(testCtx);
    if (handler.getMetadata) {
      return handler.getMetadata();
    }
  } catch {
    // Ignore errors during metadata retrieval
  }

  return undefined;
}

/**
 * List all handlers with their metadata
 */
export function listHandlersWithMetadata(): Array<{
  name: string;
  metadata?: HandlerMetadata;
}> {
  return Array.from(handlers.entries()).map(([name, entry]) => ({
    name,
    metadata: entry.metadata || getHandlerMetadata(name),
  }));
}

// Register built-in handlers lazily to avoid circular TDZ issues.
void import("./simple.js");
