import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { auth } from "./auth.js";
import type { AppVariables } from "./types.js";
import { registerRoutes } from "./routes/index.js";
import { env } from "./env.js";
import { initializeDefaultAdmin } from "./init-admin.js";

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

serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);
