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
 * Memory category types re-exported from shared-types.ts
 * This maintains backward compatibility for src files
 */
export { MEMORY_CATEGORIES, type MemoryCategory } from "../shared-types.js";
