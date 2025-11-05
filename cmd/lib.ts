import type { CommandDefinition } from "./core.js";

// ============================================================================
// Utilities
// ============================================================================

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

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return value;
  }
  return date.toLocaleString();
}

// ============================================================================
// HTTP Utilities
// ============================================================================

async function safeFetch(
  pathOrUrl: string,
  init?: RequestInit,
  base: "auth" | "app" = "auth",
  baseUrls?: { auth: string; app: string },
): Promise<Response> {
  if (!baseUrls) {
    throw new Error("Base URLs not provided to safeFetch");
  }
  const baseUrl = base === "auth" ? baseUrls.auth : baseUrls.app;
  const target = pathOrUrl.startsWith("http")
    ? pathOrUrl
    : `${baseUrl}${pathOrUrl}`;

  try {
    return await fetch(target, init);
  } catch (error) {
    console.error(`Network error calling ${target}:`, error);
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

// ============================================================================
// Server-Sent Events (SSE)
// ============================================================================

type SSEMessage = {
  event: string;
  data: string;
};

type SSEHandler = (message: SSEMessage) => void | Promise<void>;

async function readSSE(response: Response, onMessage: SSEHandler) {
  const body = response.body;
  if (!body) {
    throw new Error("SSE response does not contain a body stream.");
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const flush = async () => {
    if (!buffer) return;
    const segments = buffer.split(/\r?\n\r?\n/);
    buffer = segments.pop() ?? "";

    for (const segment of segments) {
      if (!segment.trim()) continue;
      await onMessage(parseSegment(segment));
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      await flush();
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    await flush();
  }

  reader.releaseLock();
}

function parseSegment(segment: string): SSEMessage {
  const lines = segment.split(/\r?\n/);
  let event = "message";
  const dataLines: string[] = [];

  // console.log(lines);
  for (const line of lines) {
    if (!line.trim() || line.startsWith(":")) continue;
    if (line.startsWith("event:")) {
      event = line.slice(6).trim() || event;
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(6));
      continue;
    }
  }

  return { event, data: dataLines.join("\n") };
}

// ============================================================================
// UI Utilities
// ============================================================================

function printWelcomeMessage() {
  console.log("\nMaid CLI ready. Type a command or /help to see options.");
}

function renderStatus(session: any, appBaseUrl: string) {
  console.log("\n────────────────────────");
  if (session?.user) {
    const displayName = session.user.name?.trim()
      ? `${session.user.name} <${session.user.email}>`
      : session.user.email;
    console.log(`User: ${displayName}`);
  } else {
    console.log("Not logged in");
  }

  if (session?.storedAt) {
    const storedAt = new Date(session.storedAt);
    if (!Number.isNaN(storedAt.valueOf())) {
      console.log(`Session saved: ${storedAt.toLocaleString()}`);
    }
  }

  console.log(`API base: ${appBaseUrl}`);
}

function renderCommandMenu(commands: CommandDefinition[]) {
  console.log("\nAvailable commands:");
  const commandLabels = commands.map((command) => {
    const aliases = command.aliases ?? [];
    return aliases.length
      ? `${command.name} (${aliases.join(", ")})`
      : command.name;
  });

  const nameWidth = commandLabels.reduce(
    (max, label) => Math.max(max, label.length),
    0,
  );

  commands.forEach((command, index) => {
    const label = commandLabels[index];
    const padded = label.padEnd(nameWidth, " ");
    console.log(`  ${padded}  ${command.description}`);
  });
}

function showHelp(
  session: unknown,
  commands: CommandDefinition[],
  appBaseUrl: string,
) {
  renderStatus(session, appBaseUrl);
  renderCommandMenu(commands);
}

export type { SSEMessage };
export {
  capitalize,
  extractErrorMessage,
  formatTimestamp,
  parseJSON,
  printWelcomeMessage,
  readSSE,
  renderCommandMenu,
  renderStatus,
  requiredField,
  safeFetch,
  showHelp,
};
