import z from "zod";
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

export const MEMORY_CATEGORIES = [
  "USER_INFO",
  "USER_PREFERENCE",
  "USER_GOAL",
  "USER_RELATIONSHIP",
  "EVENT",
  "OTHER",
] as const;

export const memoryCategoryEnum = z.enum(MEMORY_CATEGORIES);
