import fs from "node:fs/promises";
import path from "node:path";
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
import { confirm, input, password } from "@inquirer/prompts";
import "dotenv/config";

type SessionRecord = {
  token: string;
  session: SessionPayload | null;
  user: SessionUser | null;
  storedAt: string;
  baseURL: string;
};

type SessionPayload = {
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

type SessionUser = {
  id: string;
  createdAt: string;
  updatedAt: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  image?: string | null;
};

const SESSION_FILE = path.resolve(process.cwd(), ".session");
const AUTH_BASE_URL = resolveAuthBaseURL(
  process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
);
const APP_BASE_URL = AUTH_BASE_URL.replace(/\/api\/auth$/, "");

type StoryRecord = {
  id: number;
  userId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

type CommandContext = {
  session: SessionRecord | null;
};

type CommandOutcome = {
  exit?: boolean;
};

type CommandDefinition = {
  name: string;
  description: string;
  isVisible: (session: SessionRecord | null) => boolean;
  handler: (context: CommandContext) => Promise<CommandOutcome | void>;
};

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
      "↑/↓ move   Enter=view   e=edit   a/c=create   d/x=delete   Esc=cancel";
    return [`${prefix} ${message}`, ...lines, "", help].join("\n");
  },
);

const menuPrompt = <T>(config: MenuPromptConfig<T>) =>
  rawMenuPrompt(config as MenuPromptConfig<any>) as Promise<MenuResult<T>>;

const isLoggedIn = (session: SessionRecord | null) => Boolean(session?.token);

const COMMANDS: CommandDefinition[] = [
  {
    name: "/help",
    description: "Show available commands",
    isVisible: () => true,
    handler: async ({ session }) => {
      showHelp(session);
    },
  },
  {
    name: "/login",
    description: "Sign in with your email and password",
    isVisible: (session) => !isLoggedIn(session),
    handler: async () => {
      await handleAuth("login");
    },
  },
  {
    name: "/signup",
    description: "Create a new account",
    isVisible: (session) => !isLoggedIn(session),
    handler: async () => {
      await handleAuth("signup");
    },
  },
  {
    name: "/story",
    description: "Browse, edit, or delete stories",
    isVisible: isLoggedIn,
    handler: async ({ session }) => {
      await executeWithSession(session, browseStories);
    },
  },
  {
    name: "/logout",
    description: "Sign out and clear the saved session",
    isVisible: isLoggedIn,
    handler: async ({ session }) => {
      await handleLogout(session);
    },
  },
  {
    name: "/exit",
    description: "Close this CLI",
    isVisible: () => true,
    handler: async () => ({ exit: true }),
  },
];

const COMMAND_LOOKUP = new Map(
  COMMANDS.map((command) => [command.name, command]),
);

async function main() {
  printWelcomeMessage();

  let exit = false;
  let cancelled = false;

  while (!exit) {
    try {
      const sessionRecord = await readSessionFile();
      const visibleCommands = COMMANDS.filter((command) =>
        command.isVisible(sessionRecord),
      );

      const availableNames = visibleCommands.map((command) => command.name);
      const choice = (
        await input({
          message: "Enter a command (type /help for options):",
          validate: (value) => {
            if (!value?.trim()) {
              return "Command is required.";
            }
            const normalized = value.trim();
            if (!availableNames.includes(normalized)) {
              return `Unknown command. Expected one of: ${availableNames.join(", ")}`;
            }
            return true;
          },
        })
      ).trim();

      const command = COMMAND_LOOKUP.get(choice);
      if (!command) {
        console.log("⚠️  Command not recognized. Try again.");
        continue;
      }

      const result = await command.handler({ session: sessionRecord });
      if (result?.exit) {
        exit = true;
      }
    } catch (error) {
      if (isPromptAbortError(error)) {
        cancelled = true;
        break;
      }
      throw error;
    }
  }

  if (cancelled) {
    console.log("\n👋 Cancelled by user. Exiting.");
  } else {
    console.log("👋 Goodbye!");
  }
  process.exit(0);
}

async function handleAuth(mode: "login" | "signup") {
  const email = await input({
    message: "Email",
    validate: requiredField("Email"),
  });
  const secret = await password({
    message: "Password",
    validate: requiredField("Password"),
  });

  let name: string | undefined;
  if (mode === "signup") {
    name = await input({
      message: "Name",
      validate: requiredField("Name"),
    });
  }

  const endpoint = mode === "signup" ? "/sign-up/email" : "/sign-in/email";
  const payload =
    mode === "signup"
      ? { name, email, password: secret }
      : { email, password: secret };

  const response = await safeFetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    console.error(`❌ ${capitalize(mode)} failed: ${message}`);
    return;
  }

  const data = await parseJSON<{
    token?: string;
    user?: SessionUser;
  }>(response);

  const token = response.headers.get("set-auth-token") ?? data?.token;
  if (!token) {
    console.error(
      "❌ Authentication succeeded but no bearer token was returned.",
    );
    return;
  }

  const session = await fetchSession(token);

  const record: SessionRecord = {
    token,
    session,
    user: session?.user ?? data?.user ?? null,
    storedAt: new Date().toISOString(),
    baseURL: AUTH_BASE_URL,
  };

  await fs.writeFile(SESSION_FILE, JSON.stringify(record, null, 2), {
    encoding: "utf8",
  });

  console.log(
    `✅ ${capitalize(mode)} complete. Session saved for ${record.user?.email ?? email}.`,
  );
}

async function handleLogout(record: SessionRecord | null) {
  if (!record?.token) {
    console.log("⚠️  You are not logged in.");
    return;
  }

  const response = await safeFetch("/sign-out", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${record.token}`,
    },
  });

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    console.error(`❌ Logout failed: ${message}`);
    return;
  }

  await fs.rm(SESSION_FILE, { force: true });
  console.log("✅ Logged out and session removed.");
}

async function fetchSession(token: string) {
  const response = await safeFetch("/get-session", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

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

type StoryMenuResult =
  | { type: "exit" }
  | { type: "view"; story: StoryRecord }
  | { type: "delete"; story: StoryRecord }
  | { type: "edit"; story: StoryRecord }
  | { type: "create" };

async function browseStories(token: string) {
  while (true) {
    const stories = await fetchStories(token);
    if (stories.length === 0) {
      const wantsCreate = await confirm({
        message: "No stories found. Create one now?",
        default: true,
      });
      if (!wantsCreate) {
        console.log("ℹ️  No stories available.");
        return;
      }
      await createStoryFlow(token);
      continue;
    }

    const action = await storyMenuPrompt(stories);

    if (action.type === "exit") {
      return;
    }

    if (action.type === "view") {
      await showStoryDetails(token, action.story);
      continue;
    }

    if (action.type === "create") {
      await createStoryFlow(token);
      continue;
    }

    if (action.type === "delete") {
      const confirmed = await confirm({
        message: `Delete "${action.story.name}"?`,
        default: false,
      });
      if (!confirmed) {
        continue;
      }

      const deleted = await deleteStoryRequest(token, action.story.id);
      if (deleted) {
        console.log(`✅ Deleted story ${action.story.id}.`);
      }
      continue;
    }

    if (action.type === "edit") {
      const currentName = action.story.name;
      const newName = await input({
        message: "New story name",
        default: currentName,
        validate: requiredField("Story name"),
      });

      const trimmed = newName.trim();
      if (trimmed === currentName) {
        console.log("ℹ️  Name unchanged.");
        continue;
      }

      const updated = await updateStoryRequest(token, action.story.id, trimmed);
      if (updated) {
        console.log(`✅ Story renamed to "${updated.name}".`);
      }
    }
  }
}

async function createStoryFlow(token: string) {
  const name = await input({
    message: "New story name",
    validate: requiredField("Story name"),
  });

  const trimmed = name.trim();
  if (!trimmed) {
    console.log("⚠️  Story name cannot be empty.");
    return;
  }

  const created = await createStoryRequest(token, trimmed);
  if (created) {
    console.log(`✅ Created story "${created.name}" (id ${created.id}).`);
  }
}

async function fetchStories(token: string): Promise<StoryRecord[]> {
  const response = await safeFetch(
    "/api/s",
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    "app",
  );

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    console.error(`❌ Failed to load stories: ${message}`);
    return [];
  }

  const data = await parseJSON<{ stories?: StoryRecord[] }>(response);
  return Array.isArray(data?.stories) ? data.stories : [];
}

async function fetchStoryDetails(token: string, storyId: number) {
  const response = await safeFetch(
    `/api/s/${storyId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    "app",
  );

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    console.error(`❌ Failed to load story: ${message}`);
    return null;
  }

  const data = await parseJSON<{ story?: StoryRecord }>(response);
  return data?.story ?? null;
}

async function deleteStoryRequest(token: string, storyId: number) {
  const response = await safeFetch(
    `/api/s/${storyId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    "app",
  );

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    console.error(`❌ Failed to delete story: ${message}`);
    return false;
  }

  return true;
}

async function updateStoryRequest(
  token: string,
  storyId: number,
  name: string,
) {
  const response = await safeFetch(
    `/api/s/${storyId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name }),
    },
    "app",
  );

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    console.error(`❌ Failed to update story: ${message}`);
    return null;
  }

  const data = await parseJSON<{ story?: StoryRecord }>(response);
  return data?.story ?? null;
}

async function createStoryRequest(token: string, name: string) {
  const response = await safeFetch(
    "/api/s",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name }),
    },
    "app",
  );

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    console.error(`❌ Failed to create story: ${message}`);
    return null;
  }

  const data = await parseJSON<{ story?: StoryRecord }>(response);
  return data?.story ?? null;
}

async function showStoryDetails(token: string, storyRecord: StoryRecord) {
  const storyDetails = await fetchStoryDetails(token, storyRecord.id);
  if (!storyDetails) {
    return;
  }

  const created = formatTimestamp(storyDetails.createdAt);
  const updated = formatTimestamp(storyDetails.updatedAt);

  console.log("\n📘 Story Details");
  console.log(`   ID: ${storyDetails.id}`);
  console.log(`   Name: ${storyDetails.name}`);
  console.log(`   Owner: ${storyDetails.userId}`);
  console.log(`   Created: ${created}`);
  console.log(`   Updated: ${updated}`);
}

async function storyMenuPrompt(
  stories: StoryRecord[],
): Promise<StoryMenuResult> {
  if (stories.length === 0) {
    return { type: "exit" };
  }

  let menu: MenuResult<StoryRecord>;
  try {
    menu = await menuPrompt<StoryRecord>({
      message: "Stories",
      choices: stories.map((story) => ({
        name: `[${story.id}] ${story.name}`,
        value: story,
      })),
    });
  } catch (error) {
    if (isPromptAbortError(error)) {
      return { type: "exit" };
    }
    throw error;
  }

  if (menu.action === "cancel") {
    return { type: "exit" };
  }

  if (menu.action === "create") {
    return { type: "create" };
  }

  const selected = menu.item?.value ?? stories[0];
  if (!selected) {
    return { type: "exit" };
  }

  if (menu.action === "delete") {
    return { type: "delete", story: selected };
  }

  if (menu.action === "edit") {
    return { type: "edit", story: selected };
  }

  return { type: "view", story: selected };
}

function resolveAuthBaseURL(base: string) {
  const trimmed = base.replace(/\/$/, "");
  if (trimmed.endsWith("/api/auth")) {
    return trimmed;
  }
  return `${trimmed}/api/auth`;
}

function printWelcomeMessage() {
  console.log("\n✨ Maid CLI ready. Type a command or /help to see options.");
}

function renderStatus(session: SessionRecord | null) {
  console.log("\n────────────────────────");
  if (session?.user) {
    const displayName = session.user.name?.trim()
      ? `${session.user.name} <${session.user.email}>`
      : session.user.email;
    console.log(`👤 ${displayName}`);
  } else {
    console.log("🔒 Not logged in");
  }

  if (session?.storedAt) {
    const storedAt = new Date(session.storedAt);
    if (!Number.isNaN(storedAt.valueOf())) {
      console.log(`🗄️  Session saved: ${storedAt.toLocaleString()}`);
    }
  }

  console.log(`🌐 API base: ${APP_BASE_URL}`);
}

function renderCommandMenu(commands: CommandDefinition[]) {
  console.log("\nAvailable commands:");
  const nameWidth = commands.reduce(
    (max, command) => Math.max(max, command.name.length),
    0,
  );

  for (const command of commands) {
    const padded = command.name.padEnd(nameWidth, " ");
    console.log(`  ${padded}  ${command.description}`);
  }
}

function showHelp(session: SessionRecord | null) {
  const visibleCommands = COMMANDS.filter((command) =>
    command.isVisible(session),
  );
  renderStatus(session);
  renderCommandMenu(visibleCommands);
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return value;
  }
  return date.toLocaleString();
}

function isPromptAbortError(error: unknown): error is Error {
  return error instanceof Error && error.name === "ExitPromptError";
}

function requiredField(label: string) {
  return (value: string) => {
    if (!value?.trim()) {
      return `${label} is required.`;
    }
    return true;
  };
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

async function readSessionFile() {
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

async function safeFetch(
  pathOrUrl: string,
  init?: RequestInit,
  base: "auth" | "app" = "auth",
): Promise<Response> {
  const baseUrl = base === "auth" ? AUTH_BASE_URL : APP_BASE_URL;
  const target = pathOrUrl.startsWith("http")
    ? pathOrUrl
    : `${baseUrl}${pathOrUrl}`;

  try {
    return await fetch(target, init);
  } catch (error) {
    console.error(`❌ Network error calling ${target}:`, error);
    throw error;
  }
}

async function extractErrorMessage(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const body = await response.json();
      if (typeof body?.message === "string") {
        return body.message;
      }
    } catch {
      // ignore JSON parsing failures
    }
  }
  return `${response.status} ${response.statusText}`.trim();
}

async function parseJSON<T>(response: Response): Promise<T | null> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return null;
  }
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

void main().catch((error) => {
  if (isPromptAbortError(error)) {
    console.log("\n👋 Cancelled by user. Exiting.");
    return;
  }
  console.error("❌ Unexpected error:", error);
  process.exitCode = 1;
});
