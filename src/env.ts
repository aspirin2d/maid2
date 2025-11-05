import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  // Server
  PORT: z
    .string()
    .regex(/^\d+$/, "PORT must be a valid number")
    .transform(Number)
    .pipe(
      z
        .number()
        .int()
        .positive()
        .max(65535, "PORT must be between 1 and 65535"),
    ),

  // Authentication
  BETTER_AUTH_URL: z.url({ error: "BETTER_AUTH_URL must be a valid URL" }),

  // Default Admin User (for initial setup)
  DEFAULT_ADMIN_EMAIL: z.string().email("DEFAULT_ADMIN_EMAIL must be a valid email").optional(),
  DEFAULT_ADMIN_PASSWORD: z.string().min(6, "DEFAULT_ADMIN_PASSWORD must be at least 6 characters").optional(),
  DEFAULT_ADMIN_NAME: z.string().min(1).optional().default("Admin"),

  // Database
  DB_USER: z.string().min(1, "DB_USER is required"),
  DB_PASSWORD: z.string().min(1, "DB_PASSWORD is required"),
  DB_HOST: z.string().min(1, "DB_HOST is required"),
  DB_PORT: z
    .string()
    .regex(/^\d+$/, "DB_PORT must be a valid number")
    .transform(Number)
    .pipe(
      z
        .number()
        .int()
        .positive()
        .max(65535, "DB_PORT must be between 1 and 65535"),
    ),
  DB_NAME: z.string().min(1, "DB_NAME is required"),

  // Optional: LLM providers
  OPENAI_API_KEY: z.string().optional(),
  OLLAMA_BASE_URL: z.url().optional().or(z.literal("")),
  OLLAMA_KEEP_ALIVE: z.string().optional(),

  // Optional: LLM model configuration
  OPENAI_MODEL: z.string().optional(),
  OLLAMA_MODEL: z.string().optional(),

  // Optional: Embedding model configuration
  OPENAI_EMBEDDING_MODEL: z.string().optional(),
  OLLAMA_EMBEDDING_MODEL: z.string().optional(),
});

function validateEnv() {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("❌ Environment validation failed:");
      for (const issue of error.issues) {
        const path = issue.path.join(".");
        console.error(`   ${path}: ${issue.message}`);
      }
      console.error(
        "\nPlease check your .env file and ensure all required variables are set.",
      );
      process.exit(1);
    }
    throw error;
  }
}

export const env = validateEnv();
export type Env = z.infer<typeof envSchema>;
