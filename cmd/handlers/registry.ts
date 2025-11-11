/**
 * Handler registry and public API
 * Central place to register and access handler input builders and output formatters
 */

import { input } from "@inquirer/prompts";
import type { HandlerInputBuilder, HandlerOutputFormatter } from "./types.js";
import { buildLiveHandlerInput, formatLiveHandlerOutput } from "./live/index.js";
import { formatSimpleHandlerOutput } from "./simple.js";

/**
 * Registry of handler-specific input builders
 */
const INPUT_BUILDERS: Record<string, HandlerInputBuilder> = {
  live: buildLiveHandlerInput,
  // Add more handlers here as needed
};

/**
 * Registry of handler-specific output formatters
 */
const OUTPUT_FORMATTERS: Record<string, HandlerOutputFormatter> = {
  live: formatLiveHandlerOutput,
  simple: formatSimpleHandlerOutput,
  // Add more handlers here as needed
};

/**
 * Build input for a specific handler
 * Falls back to simple text input if handler not found
 */
export async function buildHandlerInput(handler: string): Promise<unknown> {
  const builder = INPUT_BUILDERS[handler];
  if (builder) {
    return await builder();
  }

  // Default: simple text input
  return await input({
    message: "You",
  });
}

/**
 * Format and display handler-specific output
 * Returns true if handled, false if should fall back to raw display
 */
export function formatHandlerOutput(handler: string, payload: string): boolean {
  const formatter = OUTPUT_FORMATTERS[handler];
  if (formatter) {
    return formatter(payload);
  }

  return false;
}
