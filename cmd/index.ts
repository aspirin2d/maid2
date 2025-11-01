import { confirm, input, password, select } from "@inquirer/prompts";
import { promises as fsp, existsSync } from "node:fs";
import path from "node:path";

type FlowOption = "sign-in" | "sign-up" | "session-from-token";

const tokenFilePath = path.resolve(process.cwd(), ".token");

async function loadTokenFromFile(): Promise<string | undefined> {
  if (!existsSync(tokenFilePath)) {
    return undefined;
  }

  try {
    const raw = await fsp.readFile(tokenFilePath, "utf8");
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  } catch (error) {
    console.warn(
      `\n⚠ Failed to read saved token: ${(error as Error).message}`,
    );
    return undefined;
  }
}

async function persistToken(token: string) {
  try {
    await fsp.writeFile(tokenFilePath, token, {
      encoding: "utf8",
      mode: 0o600,
    });
    console.log(`\n💾 Saved bearer token to ${path.basename(tokenFilePath)}.`);
  } catch (error) {
    console.warn(`\n⚠ Failed to persist token: ${(error as Error).message}`);
  }
}

async function clearStoredToken(logMessage = true) {
  try {
    await fsp.rm(tokenFilePath);
    if (logMessage) {
      console.log("\n🧹 Removed saved token.");
    }
  } catch (error) {
    const err = error as { code?: string; message: string };
    if (err.code !== "ENOENT") {
      console.warn(`\n⚠ Failed to remove token file: ${err.message}`);
    }
  }
}

const baseUrl = await input({
  message: "Better Auth base URL",
  default: "http://localhost:3000/api/auth",
});

let token: string | undefined;
let tokenSource: "file" | "prompt" | "api" | undefined;

const storedToken = await loadTokenFromFile();
if (storedToken) {
  token = storedToken;
  tokenSource = "file";
  console.log("\n🔐 Using saved bearer token from .token");
}

let flow: FlowOption | undefined;

if (!token) {
  flow = (await select({
    message: "Choose bearer flow",
    choices: [
      { name: "Sign in existing user", value: "sign-in" },
      { name: "Sign up new user", value: "sign-up" },
      { name: "Validate existing bearer token", value: "session-from-token" },
    ],
  })) as FlowOption;
}

if (!token && flow === "session-from-token") {
  token = await input({
    message: "Paste bearer token",
    validate: (value) =>
      value.trim().length > 0 ? true : "Token cannot be empty",
  });
  tokenSource = "prompt";
} else if (!token && flow) {
  const emailAddress = await input({
    message: "Email",
    validate: (value) =>
      value.includes("@") ? true : "Enter a valid email address",
  });

  const secret = await password({
    message: "Password",
    mask: "*",
    validate: (value) =>
      value.length >= 8 ? true : "Use at least 8 characters",
  });

  let displayName: string | undefined;
  if (flow === "sign-up") {
    displayName = await input({
      message: "Name",
      default: emailAddress.split("@")[0],
    });
  }

  const endpoint =
    flow === "sign-up"
      ? `${baseUrl}/sign-up/email`
      : `${baseUrl}/sign-in/email`;

  const payload =
    flow === "sign-up"
      ? { email: emailAddress, password: secret, name: displayName }
      : { email: emailAddress, password: secret };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`Request failed (${response.status}): ${text}`);
    process.exit(1);
  }

  const data = (await response.json()) as Record<string, unknown>;

  console.log("\n✔ Auth request succeeded");
  // console.table(
  //   Object.entries(data)
  //     .filter(([_, value]) => value != null)
  //     .reduce<Record<string, unknown>>((acc, [key, value]) => {
  //       acc[key] = value;
  //       return acc;
  //     }, {}),
  // );

  token =
    (data["token"] as string | undefined) ??
    (data["session"] instanceof Object
      ? (data["session"] as Record<string, any>)["token"]
      : undefined);

  if (!token) {
    console.warn(
      "\n⚠ No session token detected in the response; verify the Better Auth configuration.",
    );
    const proceed = await confirm({
      message: "Continue without session check?",
      default: false,
    });

    if (!proceed) {
      process.exit(0);
    }
  } else {
    console.log(`\n🔐 Bearer token\n${token}`);
  }

  tokenSource = token ? "api" : undefined;
}

if (!token) {
  console.log("\nNo token provided; skipping session lookup.");
  process.exit(0);
}

const sessionResponse = await fetch(`${baseUrl}/get-session`, {
  headers: {
    authorization: `Bearer ${token}`,
  },
});

if (!sessionResponse.ok) {
  const text = await sessionResponse.text();
  console.warn(
    `\n⚠ Session check failed (${sessionResponse.status}): ${text}`,
  );
  if (tokenSource === "file") {
    await clearStoredToken(false);
    console.log("\n🧹 Removed saved token because it is no longer valid.");
  }
  process.exit(0);
}

const session = await sessionResponse.json();
// console.log("\n📄 Session payload");
// console.dir(session, { depth: null, colors: true });

if (tokenSource !== "file") {
  await persistToken(token);
}

const postLoginAction = (await select({
  message: "Session actions",
  choices: [
    { name: "Log out", value: "logout" },
    { name: "Exit", value: "exit" },
  ],
})) as "logout" | "exit";

if (postLoginAction === "logout") {
  try {
    const signOutResponse = await fetch(`${baseUrl}/sign-out`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    if (!signOutResponse.ok) {
      const text = await signOutResponse.text();
      console.warn(
        `\n⚠ Remote sign-out failed (${signOutResponse.status}): ${text}`,
      );
    } else {
      console.log("\n🚪 Signed out via Better Auth API.");
    }
  } catch (error) {
    console.warn(
      `\n⚠ Failed to call sign-out endpoint: ${(error as Error).message}`,
    );
  }

  await clearStoredToken();
  console.log(
    "\n✅ Logged out locally. Run the CLI again to authenticate with Better Auth.",
  );
} else {
  console.log("\nSession preserved. Run the CLI again for more actions.");
}
