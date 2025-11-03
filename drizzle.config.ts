import "dotenv/config";
import { defineConfig } from "drizzle-kit";
export default defineConfig({
  out: "./drizzle",
  schema: "./src/schemas/db.ts",
  dialect: "postgresql",
  dbCredentials: {
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    host: process.env.DB_HOST!,
    port: parseInt(process.env.DB_PORT! ?? "5432"),
    database: process.env.DB_NAME!,
    ssl: false,
  },
});
