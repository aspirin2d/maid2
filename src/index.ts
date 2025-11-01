import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { auth } from "./auth.js";

const app = new Hono();

app.on(["POST", "GET"], "/api/auth/*", (c) => {
  return auth.handler(c.req.raw);
});

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

serve(
  {
    fetch: app.fetch,
    port: parseInt(process.env.PORT!),
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);
