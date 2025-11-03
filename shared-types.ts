/**
 * Shared types that can be used by both cmd and src directories
 * This file should only contain types that need to be shared across the boundary
 */

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
