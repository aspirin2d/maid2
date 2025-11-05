import type { Hono } from "hono";
import type { AppVariables } from "../types.js";
import storiesRoute from "./story.js";
import messagesRoute from "./message.js";
import memoryRoute from "./memory.js";
import adminRoute from "./admin.js";

export const registerRoutes = (app: Hono<{ Variables: AppVariables }>) => {
  app.route("/api/s", storiesRoute);
  app.route("/api/m", messagesRoute);
  app.route("/api/mem", memoryRoute);
  app.route("/api/admin", adminRoute);
};
