import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { serve } from "@hono/node-server";
import { Hono } from "hono";

const pool = new Pool({
  user: process.env.DB_USER!,
  password: process.env.DB_PASSWORD!,
  host: process.env.DB_HOST!,
  port: parseInt(process.env.DB_PORT!),
  database: process.env.DB_NAME!,
});

const db = drizzle({ client: pool });

const app = new Hono();

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

serve(
  {
    fetch: app.fetch,
    port: 3000,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);
