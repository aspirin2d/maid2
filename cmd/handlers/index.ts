/**
 * Handler module - Main exports
 *
 * This module provides a clean API for working with different story handlers.
 * Each handler can have custom input builders and output formatters.
 *
 * Structure:
 * - types.ts: Type definitions for handlers
 * - registry.ts: Handler registration and public API
 * - live/: Live handler implementation (VTuber events)
 * - simple.ts: Simple handler implementation (basic text)
 */

// Export public API
export { buildHandlerInput, formatHandlerOutput } from "./registry.js";

// Export live handler utilities
export {
  getLastLiveSpeechClips,
  clearLastLiveSpeechClips,
  setLiveSpeechHotkeyHandler,
  getLastLiveClips,
  setLastLiveClips,
  clearLastLiveClips,
  setLiveClipSearchHandler,
} from "./live/index.js";

// Export types
export type {
  HandlerInputBuilder,
  HandlerOutputFormatter,
  LiveClip,
  LiveSpeechHotkeyHandler,
  EventChoice,
  EventSelectConfig,
} from "./types.js";
