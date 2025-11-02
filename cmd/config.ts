import path from "node:path";
import process from "node:process";

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

export { APP_BASE_URL, AUTH_BASE_URL, SESSION_FILE, resolveAuthBaseURL };

