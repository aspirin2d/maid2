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

export type StoryEventName =
  | "start"
  | "delta"
  | "thinking"
  | "finish"
  | "error";

export type StoryEvent = { event: StoryEventName; data: string };

// Instance API for a story handler. Context is provided by a factory per request.
export interface StoryHandler {
  // Render prompt and JSON Schema (as JSON text or object) from input
  // Optionally return a bypass StoryEvent to skip LLM streaming.
  init(input: any): Promise<{ prompt: string; schema: ZodType } | null>;

  // SSE lifecycle hooks
  onStart(): StoryEvent;
  onContent(content: string): StoryEvent;
  onThinking(content: string): StoryEvent;
  onFinish(): Promise<StoryEvent>;
}

// Constructor signature for handlers that require per-request context
export type StoryHandlerFactory = (ctx: StoryContext) => StoryHandler;

// ======================
// Handler registry (global)
// ======================
const handlers = new Map<string, StoryHandlerFactory>();

export function registerStoryHandler(
  type: string,
  factory: StoryHandlerFactory,
) {
  handlers.set(type, factory);
}

export function clearStoryHandlers() {
  handlers.clear();
}

export function getStoryHandler(
  name: string,
  ctx: StoryContext,
): StoryHandler | undefined {
  const factory = handlers.get(name);
  if (!factory) return undefined;
  return factory(ctx);
}

export function listStoryHandlers(): string[] {
  return Array.from(handlers.keys());
}

// Register built-in handlers lazily to avoid circular TDZ issues.
void import("./simple.js");
