import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { auth } from "./auth.js";
import type { AppVariables } from "./types.js";
import { registerRoutes } from "./routes/index.js";
import { env } from "./env.js";
import { initializeDefaultAdmin } from "./admin.js";
import scheduler from "./scheduler.js";

const app = new Hono<{
  Variables: AppVariables;
}>();

app.on(["POST", "GET"], "/api/auth/*", (c) => {
  return auth.handler(c.req.raw);
});

app.use("*", async (c, next) => {
  try {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });
    if (!session) {
      c.set("user", null);
      c.set("session", null);
    } else {
      c.set("user", session.user);
      c.set("session", session.session);
    }
  } catch (error) {
    console.error("Failed to resolve session", error);
    c.set("user", null);
    c.set("session", null);
  }
  await next();
});

registerRoutes(app);

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

// Initialize default admin user before starting server
await initializeDefaultAdmin();

// Initialize cron scheduler
try {
  scheduler.loadConfig("./cron-jobs.json");
  scheduler.initializeJobs();
  console.log("[Scheduler] Cron jobs initialized successfully");
} catch (error) {
  console.error("[Scheduler] Failed to initialize cron jobs:", error);
}

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n[Server] Shutting down gracefully...");
  scheduler.stopAll();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n[Server] Shutting down gracefully...");
  scheduler.stopAll();
  process.exit(0);
});

serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);
