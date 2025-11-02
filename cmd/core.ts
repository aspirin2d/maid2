import path from "node:path";
import process from "node:process";
import fs from "node:fs/promises";
import {
  createPrompt,
  isDownKey,
  isEnterKey,
  isUpKey,
  useKeypress,
  usePrefix,
  useState,
} from "@inquirer/core";
import { extractErrorMessage, parseJSON, safeFetch } from "./lib.js";

// ============================================================================
// Configuration
// ============================================================================

const SESSION_FILE = path.resolve(process.cwd(), ".session");

function resolveAuthBaseURL(base: string) {
  const trimmed = base.replace(/\/$/, "");
  if (trimmed.endsWith("/api/auth")) {
    return trimmed;
  }
  return `${trimmed}/api/auth`;
}

const AUTH_BASE_URL = resolveAuthBaseURL(
  process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
);

const APP_BASE_URL = AUTH_BASE_URL.replace(/\/api\/auth$/, "");

// ============================================================================
// Types
// ============================================================================

export type SessionRecord = {
  token: string;
  session: SessionPayload | null;
  user: SessionUser | null;
  storedAt: string;
  baseURL: string;
};

export type SessionPayload = {
  session: {
    id: string;
    createdAt: string;
    updatedAt: string;
    userId: string;
    expiresAt: string;
    token: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  };
  user: SessionUser;
};

export type SessionUser = {
  id: string;
  createdAt: string;
  updatedAt: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  image?: string | null;
};

export type StoryRecord = {
  id: number;
  userId: string;
  name: string;
  provider: ProviderOption;
  handler: string;
  createdAt: string;
  updatedAt: string;
};

export type StoryHandlerInfo = {
  name: string;
};

export type ProviderOption = "openai" | "ollama";

export type CommandContext = {
  session: SessionRecord | null;
};

export type CommandOutcome = {
  exit?: boolean;
};

export type CommandDefinition = {
  name: string;
  description: string;
  isVisible: (session: SessionRecord | null) => boolean;
  handler: (context: CommandContext) => Promise<CommandOutcome | void>;
};

// ============================================================================
// Session Management
// ============================================================================

const isLoggedIn = (session: SessionRecord | null) => Boolean(session?.token);

async function readSessionFile(): Promise<SessionRecord | null> {
  try {
    const raw = await fs.readFile(SESSION_FILE, "utf8");
    return JSON.parse(raw) as SessionRecord;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    console.error("⚠️  Unable to read .session file:", error);
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
  const response = await safeFetch(
    "/get-session",
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    "auth",
    { auth: AUTH_BASE_URL, app: APP_BASE_URL },
  );

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    console.error(`⚠️  Unable to fetch session: ${message}`);
    return null;
  }

  return parseJSON<SessionPayload>(response);
}

async function executeWithSession(
  sessionRecord: SessionRecord | null,
  action: (token: string) => Promise<void>,
) {
  if (!sessionRecord?.token) {
    console.log("⚠️  No active session. Log in before managing stories.");
    return;
  }

  await action(sessionRecord.token);
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
export {
  APP_BASE_URL,
  AUTH_BASE_URL,
  clearSessionFile,
  executeWithSession,
  fetchSession,
  isLoggedIn,
  isPromptAbortError,
  menuPrompt,
  readSessionFile,
  resolveAuthBaseURL,
  SESSION_FILE,
  writeSessionFile,
};
