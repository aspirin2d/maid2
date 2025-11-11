/**
 * State management for live speech clips and hotkey handler
 */

import type { LiveSpeechHotkeyHandler } from "../types.js";

// State variables
let lastLiveSpeechClips: string[] = [];
let liveSpeechHotkeyHandler: LiveSpeechHotkeyHandler | null = null;
let isHotkeyRunning = false;

/**
 * Get a copy of the last live speech clips
 */
export function getLastLiveSpeechClips(): string[] {
  return lastLiveSpeechClips.slice();
}

/**
 * Set the last live speech clips
 */
export function setLastLiveSpeechClips(clips: string[]): void {
  lastLiveSpeechClips = clips;
}

/**
 * Clear all stored live speech clips
 */
export function clearLastLiveSpeechClips(): void {
  lastLiveSpeechClips = [];
}

/**
 * Set the hotkey handler for live speech generation
 */
export function setLiveSpeechHotkeyHandler(
  handler: LiveSpeechHotkeyHandler | null,
): void {
  liveSpeechHotkeyHandler = handler;
}

/**
 * Trigger the live speech hotkey handler
 */
export async function triggerLiveSpeechHotkey(): Promise<void> {
  if (!liveSpeechHotkeyHandler) {
    console.log("\nNo VTuber speech is available yet.");
    return;
  }

  if (isHotkeyRunning) {
    return;
  }

  isHotkeyRunning = true;
  try {
    await liveSpeechHotkeyHandler();
  } catch (error) {
    console.error(
      "Failed to generate speech:",
      error instanceof Error ? error.message : error,
    );
  } finally {
    isHotkeyRunning = false;
  }
}
