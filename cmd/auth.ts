import { input, password } from "@inquirer/prompts";

import { AUTH_BASE_URL } from "./config.js";
import { clearSessionFile, fetchSession, writeSessionFile } from "./session.js";
import { extractErrorMessage, parseJSON, safeFetch } from "./http.js";
import type { SessionRecord, SessionUser } from "./types.js";
import { capitalize, requiredField } from "./utils.js";

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

  await writeSessionFile(record);

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

  await clearSessionFile();
  console.log("✅ Logged out and session removed.");
}

export { handleAuth, handleLogout };

