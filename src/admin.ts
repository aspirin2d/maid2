import { eq } from "drizzle-orm";
import db from "./db.js";
import { user } from "./schemas/db.js";
import { env } from "./env.js";
import { auth } from "./auth.js";

/**
 * Initialize default admin user if configured via environment variables
 * This ensures there's always at least one admin user in the system
 */
export async function initializeDefaultAdmin() {
  // Skip if admin credentials are not configured
  if (!env.DEFAULT_ADMIN_EMAIL || !env.DEFAULT_ADMIN_PASSWORD) {
    console.log(
      "ℹ️  No default admin credentials configured. Skipping admin initialization.",
    );
    return null;
  }

  try {
    // Check if admin user already exists
    const existingUser = await db
      .select()
      .from(user)
      .where(eq(user.email, env.DEFAULT_ADMIN_EMAIL))
      .limit(1);

    if (existingUser.length > 0) {
      const adminUser = existingUser[0];

      // Update role to admin if not already set
      if (adminUser.role !== "admin") {
        await db
          .update(user)
          .set({ role: "admin" })
          .where(eq(user.id, adminUser.id));
        console.log(
          `✅ Updated existing user ${env.DEFAULT_ADMIN_EMAIL} to admin role`,
        );
      } else {
        console.log(
          `✅ Default admin user ${env.DEFAULT_ADMIN_EMAIL} already exists`,
        );
      }

      return adminUser.id;
    }

    // Create new admin user using Better Auth internal API
    console.log(`📝 Creating default admin user: ${env.DEFAULT_ADMIN_EMAIL}`);

    const newUser = await auth.api.signUpEmail({
      body: {
        email: env.DEFAULT_ADMIN_EMAIL,
        password: env.DEFAULT_ADMIN_PASSWORD,
        name: env.DEFAULT_ADMIN_NAME || "Admin",
      },
    });

    if (!newUser || !newUser.user) {
      throw new Error("Failed to create admin user");
    }

    // Update the user's role to admin
    await db
      .update(user)
      .set({
        role: "admin",
        emailVerified: true,
      })
      .where(eq(user.id, newUser.user.id));

    console.log(
      `✅ Default admin user created successfully: ${env.DEFAULT_ADMIN_EMAIL}`,
    );
    console.log(`   User ID: ${newUser.user.id}`);
    console.log(`   Role: admin`);

    return newUser.user.id;
  } catch (error) {
    console.error("❌ Failed to initialize default admin user:", error);
    // Don't throw - allow server to start even if admin creation fails
    return null;
  }
}

import type { Context } from "hono";
import { z } from "zod";
import type { AppVariables } from "./types.js";

export type AdminContext = Context<{ Variables: AppVariables }>;
export type AdminNext = () => Promise<void>;

export const requireAdmin = async (c: AdminContext, next: AdminNext) => {
  const user = c.get("user")!;

  if (!user.role || user.role !== "admin") {
    return c.json({ error: "Unauthorized: Admin access required" }, 403);
  }

  await next();
};

export const roleInputSchema = z.union([
  z.string().min(1, "Role must be a non-empty string"),
  z
    .array(z.string().min(1, "Role entries must be non-empty"))
    .min(1, "Provide at least one role"),
]);

export const createUserSchema = z.strictObject({
  email: z.email("Valid email is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  name: z.string().min(1, "Name is required"),
  role: roleInputSchema.optional(),
  data: z.record(z.string(), z.any()).optional(),
});

export const listUsersSchema = z.object({
  limit: z.coerce.number().positive().optional(),
  offset: z.coerce.number().nonnegative().optional(),
  searchValue: z.string().optional(),
  searchField: z.enum(["name", "email"]).optional(),
  searchOperator: z.enum(["contains", "starts_with", "ends_with"]).optional(),
  sortBy: z.string().optional(),
  sortDirection: z.enum(["asc", "desc"]).optional(),
  filterField: z.string().optional(),
  filterValue: z
    .union([
      z.string(),
      z.coerce.number(),
      z.enum(["true", "false"]).transform((v) => v === "true"),
    ])
    .optional(),
  filterOperator: z
    .enum(["eq", "ne", "gt", "lt", "gte", "lte", "contains"])
    .optional(),
});

export const updateUserSchema = z
  .strictObject({
    userId: z.string().min(1, "User ID is required"),
    data: z.record(z.string(), z.any()),
  })
  .superRefine((value, ctx) => {
    if (Object.keys(value.data).length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "At least one field is required to update the user",
        path: ["data"],
      });
    }
  });

export const setRoleSchema = z.strictObject({
  userId: z.string().min(1, "User ID is required"),
  role: roleInputSchema,
});

export const setPasswordSchema = z.strictObject({
  userId: z.string().min(1, "User ID is required"),
  newPassword: z.string().min(6, "Password must be at least 6 characters"),
});

export const banUserSchema = z.strictObject({
  userId: z.string().min(1, "User ID is required"),
  banReason: z.string().optional(),
  banExpiresIn: z.coerce.number().int().positive().optional(),
});

export const revokeSessionSchema = z.strictObject({
  sessionToken: z.string().min(1, "Session token is required"),
});

export const impersonateUserSchema = z.strictObject({
  userId: z.string().min(1, "User ID is required"),
});
