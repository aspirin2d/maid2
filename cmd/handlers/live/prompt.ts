/**
 * Custom event selection prompt for live handler
 * Supports number key shortcuts (1-9, 0 for 10th item)
 */

import {
  createPrompt,
  useState,
  useKeypress,
  usePrefix,
  isEnterKey,
  isUpKey,
  isDownKey,
} from "@inquirer/core";
import type { EventSelectConfig } from "../types.js";
import { triggerLiveSpeechHotkey, triggerLiveClipSearch } from "./state.js";

/**
 * Custom prompt for event selection with number key shortcuts
 * Supports 1-9 keys for direct selection and 0 for the 10th item
 */
const rawEventSelectPrompt = createPrompt<string, EventSelectConfig<string>>(
  (config, done) => {
    const prefix = usePrefix({});
    const [cursor, setCursor] = useState(0);

    const clamp = (n: number) =>
      Math.max(0, Math.min(n, config.choices.length - 1));

    useKeypress((key, rl) => {
      if (isUpKey(key)) {
        setCursor(clamp(cursor - 1));
        return;
      }
      if (isDownKey(key)) {
        setCursor(clamp(cursor + 1));
        return;
      }

      const k = (key.name || "").toLowerCase();

      if (k === "g") {
        void (async () => {
          await triggerLiveSpeechHotkey();
          rl.write("");
        })();
        return;
      }

      if (k === "s") {
        void (async () => {
          await triggerLiveClipSearch();
          rl.write("");
        })();
        return;
      }

      // Handle number key selection (1-9 and 0 for 10)
      if (k >= "0" && k <= "9") {
        const num = k === "0" ? 10 : parseInt(k, 10);
        const targetIndex = num - 1;
        if (targetIndex >= 0 && targetIndex < config.choices.length) {
          done(config.choices[targetIndex].value);
        }
        return;
      }

      if (isEnterKey(key)) {
        const choice = config.choices[cursor];
        if (choice) {
          done(choice.value);
        }
        return;
      }

      if (k === "escape") {
        // throw new ExitPromptError();
      }
    });

    const message = config.message;
    const lines = config.choices.map((choice, index) => {
      const caret = index === cursor ? "❯" : " ";
      const indexNum = index + 1;
      return `${caret} [${indexNum}] ${choice.name}`;
    });

    const help = `↑/↓ move   1-9/0=select   Enter=confirm   g=Speech TTS   s=Search clips   Esc=cancel`;

    return [`${prefix} ${message}`, ...lines, "", help].join("\n");
  },
);

/**
 * Event selection prompt with type safety
 */
export function eventSelectPrompt<T extends string>(
  config: EventSelectConfig<T>,
): Promise<T> & { cancel: () => void } {
  return rawEventSelectPrompt(
    config as EventSelectConfig<string>,
  ) as unknown as Promise<T> & { cancel: () => void };
}
