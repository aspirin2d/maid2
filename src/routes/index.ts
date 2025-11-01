import type { Hono } from "hono";
import type { AppVariables } from "../app-context.js";
import storiesRoute from "./story.js";

export const registerRoutes = (app: Hono<{ Variables: AppVariables }>) => {
  app.route("/api/s", storiesRoute);
};
