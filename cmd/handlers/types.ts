/**
 * Type definitions for CLI handlers
 */

/**
 * Handler input builder function
 * Returns the input data for a specific handler
 */
export type HandlerInputBuilder = () => Promise<unknown>;

/**
 * Handler output formatter function
 * Formats and displays handler-specific output
 * Returns true if handled, false if should fall back to raw display
 */
export type HandlerOutputFormatter = (payload: string) => boolean;

/**
 * Live clip structure for VTuber responses
 */
export type LiveClip = {
  body?: string;
  face?: string;
  speech?: string;
  text?: string;
  content?: string;
  message?: string;
};

/**
 * Callback function for live speech hotkey
 */
export type LiveSpeechHotkeyHandler = () => Promise<void> | void;

/**
 * Simple choice for event selection
 */
export interface EventChoice<T> {
  name: string;
  value: T;
}

/**
 * Config for event selection prompt
 */
export interface EventSelectConfig<T> {
  message: string;
  choices: EventChoice<T>[];
}
