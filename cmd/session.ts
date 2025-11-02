import fs from "node:fs/promises";

import { SESSION_FILE } from "./config.js";
import { extractErrorMessage, parseJSON, safeFetch } from "./http.js";
import type { SessionPayload, SessionRecord } from "./types.js";

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

export {
  clearSessionFile,
  executeWithSession,
  fetchSession,
  isLoggedIn,
  readSessionFile,
  writeSessionFile,
};

