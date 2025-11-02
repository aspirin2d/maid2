import { APP_BASE_URL, AUTH_BASE_URL } from "./config.js";

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

export { extractErrorMessage, parseJSON, safeFetch };

