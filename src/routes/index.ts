import type { Hono } from "hono";
import type { AppVariables } from "../types.js";
import storiesRoute from "./story.js";
import messagesRoute from "./message.js";
import memoryRoute from "./memory.js";
import adminRoute from "./admin.js";
import handlersRoute from "./handler.js";
import ttsRoute from "./tts.js";
import clipsRoute from "./clip.js";

export const registerRoutes = (app: Hono<{ Variables: AppVariables }>) => {
  app.route("/api/v1/stories", storiesRoute);
  app.route("/api/v1/messages", messagesRoute);
  app.route("/api/v1/memories", memoryRoute);
  app.route("/api/v1/admin", adminRoute);
  app.route("/api/v1/handlers", handlersRoute);
  app.route("/api/v1/tts", ttsRoute);
  app.route("/api/v1/clips", clipsRoute);
};
