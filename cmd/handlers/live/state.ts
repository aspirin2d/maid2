/**
 * State management for live speech clips and hotkey handler
 */

import type { LiveSpeechHotkeyHandler, LiveClip } from "../types.js";

// State variables
let lastLiveSpeechClips: string[] = [];
let liveSpeechHotkeyHandler: LiveSpeechHotkeyHandler | null = null;
let isHotkeyRunning = false;
let liveClipSearchHandler: LiveSpeechHotkeyHandler | null = null;
let isClipSearchRunning = false;
let lastLiveClips: LiveClip[] = [];

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

/**
 * Get a copy of the last live clips
 */
export function getLastLiveClips(): LiveClip[] {
  return lastLiveClips.slice();
}

/**
 * Set the last live clips
 */
export function setLastLiveClips(clips: LiveClip[]): void {
  lastLiveClips = clips;
}

/**
 * Clear all stored live clips
 */
export function clearLastLiveClips(): void {
  lastLiveClips = [];
}

/**
 * Set the clip search handler
 */
export function setLiveClipSearchHandler(
  handler: LiveSpeechHotkeyHandler | null,
): void {
  liveClipSearchHandler = handler;
}

/**
 * Trigger the clip search handler
 */
export async function triggerLiveClipSearch(): Promise<void> {
  if (!liveClipSearchHandler) {
    console.log("\nNo clip search handler is available.");
    return;
  }

  if (isClipSearchRunning) {
    return;
  }

  isClipSearchRunning = true;
  try {
    await liveClipSearchHandler();
  } catch (error) {
    console.error(
      "Failed to search clips:",
      error instanceof Error ? error.message : error,
    );
  } finally {
    isClipSearchRunning = false;
  }
}
