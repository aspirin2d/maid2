import fs from "node:fs/promises";
import process from "node:process";
import {
  createPrompt,
  isDownKey,
  isEnterKey,
  isUpKey,
  useKeypress,
  usePrefix,
  useState,
} from "@inquirer/core";
import { extractErrorMessage, parseJSON } from "./lib.js";
import { apiFetch } from "./api.js";
import { SESSION_FILE, AUTH_BASE_URL, APP_BASE_URL } from "./constants.js";
import type { CommandResult, SessionPayload, SessionRecord } from "./types.js";
export type {
  CommandContext,
  CommandDefinition,
  CommandResult,
  MemoryRecord,
  SessionPayload,
  SessionRecord,
  SessionUser,
  StoryHandlerInfo,
  StoryRecord,
  SubcommandDefinition,
} from "./types.js";

// ============================================================================
// Session Management
// ============================================================================

const isLoggedIn = (session: SessionRecord | null) => Boolean(session?.token);

const isAdmin = (session: SessionRecord | null) => {
  return Boolean(session?.user?.role === "admin");
};

async function readSessionFile(): Promise<SessionRecord | null> {
  try {
    const raw = await fs.readFile(SESSION_FILE, "utf8");
    return JSON.parse(raw) as SessionRecord;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    console.error("Unable to read .session file:", error);
    return null;
  }
}

async function writeSessionFile(record: SessionRecord) {
  await fs.writeFile(SESSION_FILE, JSON.stringify(record, null, 2), {
    encoding: "utf8",
  });
}

async function clearSessionFile() {
  await fs.rm(SESSION_FILE, { force: true });
}

async function fetchSession(token: string) {
  const response = await apiFetch(
    "/get-session",
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    "auth",
  );

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    console.error(`Unable to fetch session: ${message}`);
    return null;
  }

  return parseJSON<SessionPayload>(response);
}

async function executeWithSession(
  sessionRecord: SessionRecord | null,
  action: (token: string, session: SessionRecord) => Promise<CommandResult | void>,
  options?: { missingSessionMessage?: string },
) {
  if (!sessionRecord?.token) {
    console.log(
      options?.missingSessionMessage ??
        "No active session. Log in before continuing.",
    );
    return;
  }

  return action(sessionRecord.token, sessionRecord);
}

// ============================================================================
// Custom Prompts
// ============================================================================

type Choice<T = any> = { name: string; value: T };

type MenuResult<T = any> =
  | { action: "open"; item: Choice<T> }
  | { action: "edit"; item: Choice<T> }
  | { action: "create"; item: Choice<T> }
  | { action: "delete"; item: Choice<T> }
  | { action: "extract"; item: Choice<T> }
  | { action: "cancel" };

export interface MenuPromptConfig<T = any> {
  message?: string;
  choices: Choice<T>[];
  disabledActions?: ("create" | "edit" | "delete" | "extract")[];
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
      const disabledActions = config.disabledActions || [];

      if (k === "a" || k === "c") {
        if (!disabledActions.includes("create")) {
          done({ action: "create", item: currentChoice });
        }
        return;
      }
      if (k === "d" || k === "x") {
        if (!disabledActions.includes("delete")) {
          done({ action: "delete", item: currentChoice });
        }
        return;
      }
      if (k === "e") {
        if (!disabledActions.includes("edit")) {
          done({ action: "edit", item: currentChoice });
        }
        return;
      }
      if (k === "t") {
        if (!disabledActions.includes("extract")) {
          done({ action: "extract", item: currentChoice });
        }
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

    const disabledActions = config.disabledActions || [];
    const helpParts = ["↑/↓ move", "Enter=chat"];
    if (!disabledActions.includes("edit")) {
      helpParts.push("e=edit");
    }
    if (!disabledActions.includes("create")) {
      helpParts.push("a/c=create");
    }
    if (!disabledActions.includes("delete")) {
      helpParts.push("d/x=delete");
    }
    if (!disabledActions.includes("extract")) {
      helpParts.push("t=extract");
    }
    helpParts.push("Esc=cancel");
    const help = helpParts.join("   ");

    return [`${prefix} ${message}`, ...lines, "", help].join("\n");
  },
);

const menuPrompt = <T>(config: MenuPromptConfig<T>) =>
  rawMenuPrompt(config as MenuPromptConfig<any>) as Promise<MenuResult<T>>;

function isPromptAbortError(error: unknown): error is Error {
  return error instanceof Error && error.name === "ExitPromptError";
}

export type { Choice, MenuResult };
export {
  // Re-export constants for backward compatibility
  APP_BASE_URL,
  AUTH_BASE_URL,
  SESSION_FILE,
  // Session management
  clearSessionFile,
  executeWithSession,
  fetchSession,
  isLoggedIn,
  isAdmin,
  readSessionFile,
  writeSessionFile,
  // Custom prompts
  isPromptAbortError,
  menuPrompt,
};
