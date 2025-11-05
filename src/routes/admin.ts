import { Hono } from "hono";
import type { AppVariables } from "../types.js";
import { requireAuth } from "../middlewares/auth.js";
import { auth } from "../auth.js";
import { formatZodError } from "../validation.js";
import {
  requireAdmin,
  createUserSchema,
  listUsersSchema,
  updateUserSchema,
  setRoleSchema,
  setPasswordSchema,
  banUserSchema,
  revokeSessionSchema,
  impersonateUserSchema,
  createApiKeySchema,
  listApiKeysSchema,
  updateApiKeySchema,
  deleteApiKeySchema,
  getApiKeySchema,
} from "../admin.js";

const adminRoute = new Hono<{ Variables: AppVariables }>();

// Apply authentication middleware to all admin routes
adminRoute.use("/*", requireAuth);

adminRoute.use("/*", requireAdmin);

// ============================================================================
// User Management Routes
// ============================================================================

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

// ============================================================================
// API Key Management Routes
// ============================================================================

adminRoute.post("/api-keys", async (c) => {
  const body = await c.req.json();
  const parsed = createApiKeySchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: formatZodError(parsed.error) }, 400);
  }

  try {
    const result = await auth.api.createApiKey({
      body: parsed.data,
      headers: c.req.raw.headers,
    });

    return c.json({ apiKey: result });
  } catch (error) {
    console.error("Failed to create API key", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to create API key" },
      500,
    );
  }
});

adminRoute.get("/api-keys/user/:userId", async (c) => {
  const userId = c.req.param("userId");
  const parsed = listApiKeysSchema.safeParse({ userId });

  if (!parsed.success) {
    return c.json({ error: formatZodError(parsed.error) }, 400);
  }

  try {
    const result = await auth.api.listApiKeys({
      query: { userId },
      headers: c.req.raw.headers,
    });

    return c.json({ apiKeys: result });
  } catch (error) {
    console.error("Failed to list API keys", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to list API keys" },
      500,
    );
  }
});

adminRoute.get("/api-keys/:keyId", async (c) => {
  const keyId = c.req.param("keyId");
  const parsed = getApiKeySchema.safeParse({ keyId });

  if (!parsed.success) {
    return c.json({ error: formatZodError(parsed.error) }, 400);
  }

  try {
    const result = await auth.api.getApiKey({
      query: { id: keyId },
      headers: c.req.raw.headers,
    });

    return c.json({ apiKey: result });
  } catch (error) {
    console.error("Failed to get API key", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to get API key" },
      500,
    );
  }
});

adminRoute.patch("/api-keys/:keyId", async (c) => {
  const keyId = c.req.param("keyId");
  const body = await c.req.json();

  const parsed = updateApiKeySchema.safeParse({ keyId, ...body });

  if (!parsed.success) {
    return c.json({ error: formatZodError(parsed.error) }, 400);
  }

  try {
    const result = await auth.api.updateApiKey({
      body: parsed.data,
      headers: c.req.raw.headers,
    });

    return c.json({ apiKey: result });
  } catch (error) {
    console.error("Failed to update API key", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to update API key" },
      500,
    );
  }
});

adminRoute.delete("/api-keys/:keyId", async (c) => {
  const keyId = c.req.param("keyId");
  const parsed = deleteApiKeySchema.safeParse({ keyId });

  if (!parsed.success) {
    return c.json({ error: formatZodError(parsed.error) }, 400);
  }

  try {
    await auth.api.deleteApiKey({
      body: { keyId },
      headers: c.req.raw.headers,
    });

    return c.json({ success: true });
  } catch (error) {
    console.error("Failed to delete API key", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to delete API key" },
      500,
    );
  }
});

export default adminRoute;
