import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AppVariables } from "../types.js";
import { requireAuth } from "../middlewares/auth.js";
import { auth } from "../auth.js";
import { formatZodError } from "../validation.js";

const adminRoute = new Hono<{ Variables: AppVariables }>();

// Apply authentication middleware to all admin routes
adminRoute.use("/*", requireAuth);

// Middleware to check if user is admin
const requireAdmin = async (
  c: Context<{ Variables: AppVariables }>,
  next: () => Promise<void>,
) => {
  const user = c.get("user")!;

  // Check if user has admin role
  if (!user.role || user.role !== "admin") {
    return c.json({ error: "Unauthorized: Admin access required" }, 403);
  }

  await next();
};

adminRoute.use("/*", requireAdmin);

// ============================================================================
// User Management Routes
// ============================================================================

const roleInputSchema = z.union([
  z.string().min(1, "Role must be a non-empty string"),
  z.array(z.string().min(1, "Role entries must be non-empty")).min(1, "Provide at least one role"),
]);

const createUserSchema = z.strictObject({
  email: z.string().email("Valid email is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  name: z.string().min(1, "Name is required"),
  role: roleInputSchema.optional(),
  data: z.record(z.string(), z.any()).optional(),
});

adminRoute.post("/users", async (c) => {
  const body = await c.req.json();
  const parsed = createUserSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: formatZodError(parsed.error) }, 400);
  }

  try {
    const payload = parsed.data as typeof parsed.data & {
      role?: string | string[];
    };
    const result = await auth.api.createUser({
      body: payload as any,
      headers: c.req.raw.headers,
    });

    return c.json({ user: result });
  } catch (error) {
    console.error("Failed to create user", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to create user" },
      500,
    );
  }
});

const listUsersSchema = z.object({
  limit: z.coerce.number().positive().optional(),
  offset: z.coerce.number().nonnegative().optional(),
  searchValue: z.string().optional(),
  searchField: z.enum(["name", "email"]).optional(),
  searchOperator: z.enum(["contains", "starts_with", "ends_with"]).optional(),
  sortBy: z.string().optional(),
  sortDirection: z.enum(["asc", "desc"]).optional(),
  filterField: z.string().optional(),
  filterValue: z
    .union([z.string(), z.coerce.number(), z.enum(["true", "false"]).transform((v) => v === "true")])
    .optional(),
  filterOperator: z.enum(["eq", "ne", "gt", "lt", "gte", "lte", "contains"]).optional(),
});

adminRoute.get("/users", async (c) => {
  const query = c.req.query();
  const parsed = listUsersSchema.safeParse(query);

  if (!parsed.success) {
    return c.json({ error: formatZodError(parsed.error) }, 400);
  }

  try {
    const result = await auth.api.listUsers({
      query: parsed.data,
      headers: c.req.raw.headers,
    });

    return c.json(result);
  } catch (error) {
    console.error("Failed to list users", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to list users" },
      500,
    );
  }
});

const updateUserSchema = z
  .strictObject({
    userId: z.string().min(1, "User ID is required"),
    data: z.record(z.string(), z.any()),
  })
  .superRefine((value, ctx) => {
    if (Object.keys(value.data).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one field is required to update the user",
        path: ["data"],
      });
    }
  });

adminRoute.patch("/users/:userId", async (c) => {
  const userId = c.req.param("userId");
  const body = await c.req.json();

  const parsed = updateUserSchema.safeParse({ userId, data: body });

  if (!parsed.success) {
    return c.json({ error: formatZodError(parsed.error) }, 400);
  }

  try {
    const { userId: targetUserId, data } = parsed.data;
    const result = await auth.api.adminUpdateUser({
      body: { userId: targetUserId, data },
      headers: c.req.raw.headers,
    });

    return c.json({ user: result });
  } catch (error) {
    console.error("Failed to update user", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to update user" },
      500,
    );
  }
});

const setRoleSchema = z.strictObject({
  userId: z.string().min(1, "User ID is required"),
  role: roleInputSchema,
});

adminRoute.post("/users/:userId/role", async (c) => {
  const userId = c.req.param("userId");
  const body = await c.req.json();

  const parsed = setRoleSchema.safeParse({ userId, role: body.role });

  if (!parsed.success) {
    return c.json({ error: formatZodError(parsed.error) }, 400);
  }

  try {
    const payload = parsed.data as typeof parsed.data & {
      role: string | string[];
    };
    const result = await auth.api.setRole({
      body: payload as any,
      headers: c.req.raw.headers,
    });

    return c.json({ user: result });
  } catch (error) {
    console.error("Failed to set user role", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to set user role" },
      500,
    );
  }
});

const setPasswordSchema = z.strictObject({
  userId: z.string().min(1, "User ID is required"),
  newPassword: z.string().min(6, "Password must be at least 6 characters"),
});

adminRoute.post("/users/:userId/password", async (c) => {
  const userId = c.req.param("userId");
  const body = await c.req.json();

  const parsed = setPasswordSchema.safeParse({ userId, newPassword: body.newPassword || body.password });

  if (!parsed.success) {
    return c.json({ error: formatZodError(parsed.error) }, 400);
  }

  try {
    await auth.api.setPassword({
      body: parsed.data,
      headers: c.req.raw.headers,
    });

    return c.json({ success: true });
  } catch (error) {
    console.error("Failed to set user password", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to set user password" },
      500,
    );
  }
});

adminRoute.delete("/users/:userId", async (c) => {
  const userId = c.req.param("userId");
  const currentUser = c.get("user")!;

  // Prevent self-deletion
  if (userId === currentUser.id) {
    return c.json(
      { error: "Cannot delete your own account. Please ask another admin." },
      400,
    );
  }

  try {
    await auth.api.removeUser({
      body: { userId },
      headers: c.req.raw.headers,
    });

    return c.json({ success: true });
  } catch (error) {
    console.error("Failed to remove user", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to remove user" },
      500,
    );
  }
});

// ============================================================================
// User Banning Routes
// ============================================================================

const banUserSchema = z.strictObject({
  userId: z.string().min(1, "User ID is required"),
  banReason: z.string().optional(),
  banExpiresIn: z.coerce.number().int().positive().optional(),
});

adminRoute.post("/users/:userId/ban", async (c) => {
  const userId = c.req.param("userId");
  const body = await c.req.json();
  const currentUser = c.get("user")!;

  // Prevent self-banning
  if (userId === currentUser.id) {
    return c.json(
      { error: "Cannot ban your own account. Please ask another admin." },
      400,
    );
  }

  const parsed = banUserSchema.safeParse({ userId, ...body });

  if (!parsed.success) {
    return c.json({ error: formatZodError(parsed.error) }, 400);
  }

  try {
    const result = await auth.api.banUser({
      body: parsed.data,
      headers: c.req.raw.headers,
    });

    return c.json({ user: result });
  } catch (error) {
    console.error("Failed to ban user", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to ban user" },
      500,
    );
  }
});

adminRoute.post("/users/:userId/unban", async (c) => {
  const userId = c.req.param("userId");

  try {
    const result = await auth.api.unbanUser({
      body: { userId },
      headers: c.req.raw.headers,
    });

    return c.json({ user: result });
  } catch (error) {
    console.error("Failed to unban user", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to unban user" },
      500,
    );
  }
});

// ============================================================================
// Session Management Routes
// ============================================================================

adminRoute.post("/users/:userId/sessions/list", async (c) => {
  const userId = c.req.param("userId");

  try {
    const result = await auth.api.listUserSessions({
      body: { userId },
      headers: c.req.raw.headers,
    });

    return c.json({ sessions: result });
  } catch (error) {
    console.error("Failed to list user sessions", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to list user sessions" },
      500,
    );
  }
});

const revokeSessionSchema = z.strictObject({
  sessionToken: z.string().min(1, "Session token is required"),
});

adminRoute.post("/users/:userId/sessions/revoke", async (c) => {
  const body = await c.req.json();
  const parsed = revokeSessionSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: formatZodError(parsed.error) }, 400);
  }

  try {
    await auth.api.revokeUserSession({
      body: parsed.data,
      headers: c.req.raw.headers,
    });

    return c.json({ success: true });
  } catch (error) {
    console.error("Failed to revoke user session", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to revoke user session" },
      500,
    );
  }
});

adminRoute.post("/users/:userId/sessions/revoke-all", async (c) => {
  const userId = c.req.param("userId");

  try {
    await auth.api.revokeUserSessions({
      body: { userId },
      headers: c.req.raw.headers,
    });

    return c.json({ success: true });
  } catch (error) {
    console.error("Failed to revoke user sessions", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to revoke user sessions" },
      500,
    );
  }
});

// ============================================================================
// Impersonation Routes
// ============================================================================

const impersonateUserSchema = z.strictObject({
  userId: z.string().min(1, "User ID is required"),
});

adminRoute.post("/users/:userId/impersonate", async (c) => {
  const userId = c.req.param("userId");
  const parsed = impersonateUserSchema.safeParse({ userId });

  if (!parsed.success) {
    return c.json({ error: formatZodError(parsed.error) }, 400);
  }

  try {
    const result = await auth.api.impersonateUser({
      body: parsed.data,
      headers: c.req.raw.headers,
    });

    return c.json(result);
  } catch (error) {
    console.error("Failed to impersonate user", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to impersonate user" },
      500,
    );
  }
});

adminRoute.post("/impersonate/stop", async (c) => {
  try {
    const result = await auth.api.stopImpersonating({
      headers: c.req.raw.headers,
    });

    return c.json(result);
  } catch (error) {
    console.error("Failed to stop impersonating", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to stop impersonating" },
      500,
    );
  }
});

export default adminRoute;
