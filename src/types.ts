import { auth } from "./auth.js";

export type AppVariables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

/**
 * JSON-compatible value type for metadata and dynamic data
 * More type-safe than Record<string, any>
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Metadata type for database entities
 */
export type Metadata = Record<string, JsonValue>;

/**
 * Memory category enum values
 * Centralized definition used across schema, prompts, and routes
 */
export const MEMORY_CATEGORIES = [
  "USER_INFO",
  "USER_PREFERENCE",
  "USER_GOAL",
  "USER_RELATIONSHIP",
  "EVENT",
  "OTHER",
] as const;

/**
 * Memory category type derived from the const array
 */
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];
