import {
  createPrompt,
  isDownKey,
  isEnterKey,
  isUpKey,
  useKeypress,
  usePrefix,
  useState,
} from "@inquirer/core";

type Choice<T = any> = { name: string; value: T };

type MenuResult<T = any> =
  | { action: "open"; item: Choice<T> }
  | { action: "edit"; item: Choice<T> }
  | { action: "create"; item: Choice<T> }
  | { action: "delete"; item: Choice<T> }
  | { action: "cancel" };

export interface MenuPromptConfig<T = any> {
  message?: string;
  choices: Choice<T>[];
}

const rawMenuPrompt = createPrompt<MenuResult<any>, MenuPromptConfig<any>>(
  (config, done) => {
    const prefix = usePrefix({});
    const [cursor, setCursor] = useState(0);

    const clamp = (n: number) =>
      Math.max(0, Math.min(n, config.choices.length - 1));

    useKeypress((key) => {
      if (isDownKey(key)) {
        setCursor(clamp(cursor + 1));
        return;
      }
      if (isUpKey(key)) {
        setCursor(clamp(cursor - 1));
        return;
      }

      if (key.ctrl && key.name === "c") {
        done({ action: "cancel" });
        return;
      }

      const currentChoice = config.choices[cursor] ?? config.choices[0];
      if (!currentChoice) {
        done({ action: "cancel" });
        return;
      }

      const k = (key.name || "").toLowerCase();
      if (k === "a" || k === "c") {
        done({ action: "create", item: currentChoice });
        return;
      }
      if (k === "d" || k === "x") {
        done({ action: "delete", item: currentChoice });
        return;
      }
      if (k === "e") {
        done({ action: "edit", item: currentChoice });
        return;
      }
      if (isEnterKey(key)) {
        done({ action: "open", item: currentChoice });
        return;
      }
      if (k === "escape") {
        done({ action: "cancel" });
        return;
      }
    });

    const message = config.message ?? "Select an item";
    const lines = config.choices.map((choice, index) => {
      const caret = index === cursor ? "❯" : " ";
      return `${caret} ${choice.name}`;
    });
    const help =
      "↑/↓ move   Enter=chat   e=edit   a/c=create   d/x=delete   Esc=cancel";
    return [`${prefix} ${message}`, ...lines, "", help].join("\n");
  },
);

const menuPrompt = <T>(config: MenuPromptConfig<T>) =>
  rawMenuPrompt(config as MenuPromptConfig<any>) as Promise<MenuResult<T>>;

function isPromptAbortError(error: unknown): error is Error {
  return error instanceof Error && error.name === "ExitPromptError";
}

export type { Choice, MenuResult };
export { isPromptAbortError, menuPrompt };
