import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { input, password } from "@inquirer/prompts";
import { config as loadEnv } from "dotenv";

loadEnv({
  path: path.resolve(process.cwd(), ".env"),
  override: false,
});

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
    name: "/story list",
    description: "List your stories",
    isVisible: isLoggedIn,
    handler: async ({ session }) => {
      await executeWithSession(session, listStories);
    },
  },
  {
    name: "/story show",
    description: "Show a story by ID",
    isVisible: isLoggedIn,
    handler: async ({ session }) => {
      await executeWithSession(session, showStory);
    },
  },
  {
    name: "/story create",
    description: "Create a new story",
    isVisible: isLoggedIn,
    handler: async ({ session }) => {
      await executeWithSession(session, createStory);
    },
  },
  {
    name: "/story update",
    description: "Rename an existing story",
    isVisible: isLoggedIn,
    handler: async ({ session }) => {
      await executeWithSession(session, updateStory);
    },
  },
  {
    name: "/story delete",
    description: "Delete a story",
    isVisible: isLoggedIn,
    handler: async ({ session }) => {
      await executeWithSession(session, deleteStory);
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

const COMMAND_LOOKUP = new Map(COMMANDS.map((command) => [command.name, command]));

async function main() {
  printWelcomeMessage();

  let exit = false;

  while (!exit) {
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
  }

  console.log("👋 Goodbye!");
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

async function listStories(token: string) {
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
    console.error(`❌ Failed to list stories: ${message}`);
    return;
  }

  const data = await parseJSON<{ stories?: StoryRecord[] }>(response);
  const stories = Array.isArray(data?.stories) ? data.stories : [];

  if (stories.length === 0) {
    console.log("ℹ️  No stories found.");
    return;
  }

  console.log("Stories:");
  for (const entry of stories) {
    console.log(`- [${entry.id}] ${entry.name}`);
  }
}

async function showStory(token: string) {
  const storyId = await promptForStoryId();
  if (storyId === null) {
    return;
  }

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
    console.error(`❌ Failed to fetch story: ${message}`);
    return;
  }

  const data = await parseJSON<{ story?: StoryRecord }>(response);
  if (!data?.story) {
    console.log("ℹ️  Story details are unavailable.");
    return;
  }

  logStoryDetails("Story details", data.story);
}

async function createStory(token: string) {
  const name = await input({
    message: "Story name",
    validate: requiredField("Story name"),
  });

  const response = await safeFetch(
    "/api/s",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: name.trim() }),
    },
    "app",
  );

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    console.error(`❌ Failed to create story: ${message}`);
    return;
  }

  const data = await parseJSON<{ story?: StoryRecord }>(response);
  if (!data?.story) {
    console.log("✅ Story created.");
    return;
  }

  logStoryDetails("Created story", data.story);
}

async function updateStory(token: string) {
  const storyId = await promptForStoryId();
  if (storyId === null) {
    return;
  }

  const name = await input({
    message: "New story name",
    validate: requiredField("Story name"),
  });

  const response = await safeFetch(
    `/api/s/${storyId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: name.trim() }),
    },
    "app",
  );

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    console.error(`❌ Failed to update story: ${message}`);
    return;
  }

  const data = await parseJSON<{ story?: StoryRecord }>(response);
  if (!data?.story) {
    console.log("✅ Story updated.");
    return;
  }

  logStoryDetails("Updated story", data.story);
}

async function deleteStory(token: string) {
  const storyId = await promptForStoryId();
  if (storyId === null) {
    return;
  }

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
    return;
  }

  console.log(`✅ Deleted story ${storyId}.`);
}

async function promptForStoryId() {
  const value = await input({
    message: "Story ID",
    validate: requirePositiveInteger("Story ID"),
  });

  const id = Number(value.trim());
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }
  return id;
}

function logStoryDetails(title: string, storyRecord: StoryRecord) {
  console.log(title);
  console.log(`- ID: ${storyRecord.id}`);
  console.log(`- Name: ${storyRecord.name}`);
  console.log(`- Created: ${storyRecord.createdAt}`);
  console.log(`- Updated: ${storyRecord.updatedAt}`);
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

function requiredField(label: string) {
  return (value: string) => {
    if (!value?.trim()) {
      return `${label} is required.`;
    }
    return true;
  };
}

function requirePositiveInteger(label: string) {
  return (value: string) => {
    const trimmed = value?.trim() ?? "";
    if (!trimmed) {
      return `${label} is required.`;
    }
    const numeric = Number(trimmed);
    if (!Number.isInteger(numeric) || numeric <= 0) {
      return `${label} must be a positive integer.`;
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
  console.error("❌ Unexpected error:", error);
  process.exitCode = 1;
});
