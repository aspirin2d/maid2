/**
 * Output formatter for the live handler
 * Formats and displays VTuber clips
 */

import type { LiveClip } from "../types.js";
import { setLastLiveSpeechClips, clearLastLiveSpeechClips } from "./state.js";

/**
 * Format and display live handler output (VTuber clips)
 * Returns true if successfully formatted, false otherwise
 */
export function formatLiveHandlerOutput(payload: string): boolean {
  const raw = payload.trim();
  if (!raw) {
    clearLastLiveSpeechClips();
    return false;
  }

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    clearLastLiveSpeechClips();
    return false;
  }

  if (!parsed || typeof parsed !== "object") {
    clearLastLiveSpeechClips();
    return false;
  }

  const data = parsed as { clips?: LiveClip[] };
  if (!Array.isArray(data.clips) || data.clips.length === 0) {
    clearLastLiveSpeechClips();
    return false;
  }

  const speechSnippets = data.clips
    .map((clip) => clip?.speech || clip?.text || clip?.content || clip?.message)
    .filter((speech): speech is string => Boolean(speech && speech.trim().length > 0))
    .map((speech) => speech.trim());

  if (speechSnippets.length > 0) {
    setLastLiveSpeechClips(speechSnippets);
  } else {
    clearLastLiveSpeechClips();
  }

  console.log("\nVTuber Response:");
  data.clips.forEach((clip, index) => {
    if (data.clips!.length > 1) {
      console.log(`\n  Clip ${index + 1}/${data.clips!.length}:`);
    }
    if (clip.body) {
      console.log(`    Body: ${clip.body}`);
    }
    if (clip.face) {
      console.log(`    Face: ${clip.face}`);
    }
    if (clip.speech) {
      console.log(`    Speech: ${clip.speech}`);
    }
  });

  return true;
}
