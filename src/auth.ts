import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import db from "./db.js"; // your drizzle instance

import { bearer, openAPI, admin, apiKey } from "better-auth/plugins";
import { env } from "./env.js";

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    requireEmailVerification: false,
  },
  plugins: [bearer(), admin(), apiKey(), openAPI()],
});
