import { confirm, input, password, select } from "@inquirer/prompts";

type FlowOption = "sign-in" | "sign-up" | "session-from-token";

const baseUrl = await input({
  message: "Better Auth base URL",
  default: "http://localhost:3000/api/auth",
});

const flow = (await select({
  message: "Choose bearer flow",
  choices: [
    { name: "Sign in existing user", value: "sign-in" },
    { name: "Sign up new user", value: "sign-up" },
    { name: "Validate existing bearer token", value: "session-from-token" },
  ],
})) as FlowOption;

let token: string | undefined;

if (flow === "session-from-token") {
  token = await input({
    message: "Paste bearer token",
    validate: (value) =>
      value.trim().length > 0 ? true : "Token cannot be empty",
  });
} else {
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
  console.table(
    Object.entries(data)
      .filter(([_, value]) => value != null)
      .reduce<Record<string, unknown>>((acc, [key, value]) => {
        acc[key] = value;
        return acc;
      }, {}),
  );

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
}

if (!token) {
  console.log("\nNo token provided; skipping session lookup.");
  process.exit(0);
}

const sessionResponse = await fetch(`${baseUrl}/session`, {
  headers: {
    authorization: `Bearer ${token}`,
  },
});

if (!sessionResponse.ok) {
  const text = await sessionResponse.text();
  console.warn(
    `\n⚠ Session check failed (${sessionResponse.status}): ${text}`,
  );
  process.exit(0);
}

const session = await sessionResponse.json();
console.log("\n📄 Session payload");
console.dir(session, { depth: null, colors: true });
