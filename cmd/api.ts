/**
 * Configured API fetch wrapper
 * Automatically injects AUTH_BASE_URL and APP_BASE_URL into safeFetch
 */

import { safeFetch } from "./lib.js";
import { AUTH_BASE_URL, APP_BASE_URL } from "./constants.js";

/**
 * Pre-configured fetch wrapper for API calls
 * Automatically uses AUTH_BASE_URL and APP_BASE_URL from constants
 *
 * @param pathOrUrl - API path (e.g., "/api/s") or full URL
 * @param init - Fetch options (headers, method, body, etc.)
 * @param base - Which base URL to use: "auth" or "app" (default: "app")
 * @returns Response object
 *
 * @example
 * // Fetch from app API
 * const response = await apiFetch("/api/s", {
 *   method: "GET",
 *   headers: { Authorization: `Bearer ${token}` }
 * });
 *
 * @example
 * // Fetch from auth API
 * const response = await apiFetch("/sign-in/email", {
 *   method: "POST",
 *   headers: { "Content-Type": "application/json" },
 *   body: JSON.stringify({ email, password })
 * }, "auth");
 */
export async function apiFetch(
  pathOrUrl: string,
  init?: RequestInit,
  base: "auth" | "app" = "app",
): Promise<Response> {
  return safeFetch(pathOrUrl, init, base, {
    auth: AUTH_BASE_URL,
    app: APP_BASE_URL,
  });
}
