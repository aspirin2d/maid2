import path from "node:path";
import process from "node:process";

// ============================================================================
// LLM Providers
// ============================================================================

export const PROVIDERS = ["ollama", "openai"] as const;
export type ProviderOption = (typeof PROVIDERS)[number];

// ============================================================================
// Memory Categories
// ============================================================================

export const MEMORY_CATEGORIES = [
  "USER_INFO",
  "USER_PREFERENCE",
  "USER_GOAL",
  "USER_RELATIONSHIP",
  "EVENT",
  "OTHER",
] as const;

export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

// ============================================================================
// API Configuration
// ============================================================================

/**
 * Resolve and normalize the Better Auth base URL
 * Ensures it ends with /api/auth
 */
function resolveAuthBaseURL(base: string): string {
  const trimmed = base.replace(/\/$/, "");
  if (trimmed.endsWith("/api/auth")) {
    return trimmed;
  }
  return `${trimmed}/api/auth`;
}

/**
 * Better Auth API base URL
 * Example: http://localhost:3000/api/auth
 */
export const AUTH_BASE_URL = resolveAuthBaseURL(
  process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
);

/**
 * Application API base URL (without /api/auth suffix)
 * Example: http://localhost:3000
 */
export const APP_BASE_URL = AUTH_BASE_URL.replace(/\/api\/auth$/, "");

// ============================================================================
// Session Storage
// ============================================================================

/**
 * Path to the local session file
 * Stores authentication token and session data
 */
export const SESSION_FILE = path.resolve(process.cwd(), ".session");
