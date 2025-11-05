import { confirm, input, select } from "@inquirer/prompts";
import {
  extractErrorMessage,
  parseJSON,
  formatTimestamp,
  requiredField,
} from "./lib.js";
import { isPromptAbortError, menuPrompt, type MenuResult } from "./core.js";
import { apiFetch } from "./api.js";

// ============================================================================
// Type Definitions
// ============================================================================

export type AdminUser = {
  id: string;
  email: string;
  name: string;
  role: string | null;
  banned: boolean;
  banReason: string | null;
  banExpires: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminSession = {
  id: string;
  userId: string;
  token: string;
  expiresAt: string;
  createdAt: string;
  ipAddress: string | null;
  userAgent: string | null;
};

export type AdminApiKey = {
  id: string;
  name: string | null;
  start: string | null;
  prefix: string | null;
  key: string;
  userId: string;
  refillInterval: number | null;
  refillAmount: number | null;
  lastRefillAt: string | null;
  enabled: boolean | null;
  rateLimitEnabled: boolean | null;
  rateLimitTimeWindow: number | null;
  rateLimitMax: number | null;
  requestCount: number | null;
  remaining: number | null;
  lastRequest: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  permissions: string | null;
  metadata: string | null;
};

type UserMenuResult =
  | { type: "exit" }
  | { type: "view"; user: AdminUser }
  | { type: "edit"; user: AdminUser }
  | { type: "create" }
  | { type: "delete"; user: AdminUser }
  | { type: "ban"; user: AdminUser }
  | { type: "unban"; user: AdminUser }
  | { type: "setRole"; user: AdminUser }
  | { type: "sessions"; user: AdminUser };

// ============================================================================
// User Management
// ============================================================================

export async function browseUsers(token: string, currentUserId?: string | null) {
  while (true) {
    const users = await fetchUsers(token);
    if (users.length === 0) {
      const wantsCreate = await confirm({
        message: "No users found. Create one now?",
        default: false,
      });
      if (!wantsCreate) {
        console.log("No users available.");
        return;
      }
      await createUserFlow(token);
      continue;
    }

    const action = await userMenuPrompt(users);

    if (action.type === "exit") {
      return;
    }

    if (action.type === "view") {
      viewUserDetails(action.user);
      continue;
    }

    if (action.type === "create") {
      await createUserFlow(token);
      continue;
    }

    if (action.type === "edit") {
      await editUserFlow(token, action.user, currentUserId ?? undefined);
      continue;
    }

    if (action.type === "delete") {
      if (currentUserId && action.user.id === currentUserId) {
        console.log("Cannot delete your own account. Please ask another admin.");
        continue;
      }
      const confirmed = await confirm({
        message: `Delete user "${action.user.email}"? This action cannot be undone.`,
        default: false,
      });
      if (!confirmed) {
        continue;
      }

      const deleted = await deleteUserRequest(token, action.user.id);
      if (deleted) {
        console.log(`Deleted user ${action.user.email}.`);
      }
      continue;
    }

    if (action.type === "ban") {
      if (currentUserId && action.user.id === currentUserId) {
        console.log("Cannot ban your own account. Please ask another admin.");
        continue;
      }
      await banUserFlow(token, action.user, currentUserId ?? undefined);
      continue;
    }

    if (action.type === "unban") {
      const confirmed = await confirm({
        message: `Unban user "${action.user.email}"?`,
        default: true,
      });
      if (!confirmed) {
        continue;
      }

      const result = await unbanUserRequest(token, action.user.id);
      if (result) {
        console.log(`User ${action.user.email} has been unbanned.`);
      }
      continue;
    }

    if (action.type === "setRole") {
      await setRoleFlow(token, action.user);
      continue;
    }

    if (action.type === "sessions") {
      await manageUserSessionsFlow(token, action.user);
      continue;
    }
  }
}

async function userMenuPrompt(users: AdminUser[]): Promise<UserMenuResult> {
  const choices = users.map((u) => ({
    name: `${u.email} (${u.name}) ${u.banned ? "[BANNED]" : ""} - ${u.role || "user"}`,
    value: u,
  }));

  try {
    const result = await menuPrompt<AdminUser>({
      message: "Admin Panel - Manage Users",
      choices,
      disabledActions: ["extract"],
      enterLabel: "view",
    });

    if (result.action === "cancel") {
      return { type: "exit" };
    }
    if (result.action === "open") {
      return { type: "view", user: result.item.value };
    }
    if (result.action === "create") {
      return { type: "create" };
    }
    if (result.action === "edit") {
      return { type: "edit", user: result.item.value };
    }
    if (result.action === "delete") {
      return { type: "delete", user: result.item.value };
    }

    return { type: "exit" };
  } catch (error) {
    if (isPromptAbortError(error)) {
      return { type: "exit" };
    }
    throw error;
  }
}

function viewUserDetails(user: AdminUser) {
  console.log("\n=== User Details ===");
  console.log(`ID: ${user.id}`);
  console.log(`Email: ${user.email}`);
  console.log(`Name: ${user.name}`);
  console.log(`Role: ${user.role || "user"}`);
  console.log(`Banned: ${user.banned ? "Yes" : "No"}`);
  if (user.banned && user.banReason) {
    console.log(`Ban Reason: ${user.banReason}`);
  }
  if (user.banned && user.banExpires) {
    console.log(`Ban Expires: ${formatTimestamp(user.banExpires)}`);
  }
  console.log(`Created: ${formatTimestamp(user.createdAt)}`);
  console.log(`Updated: ${formatTimestamp(user.updatedAt)}`);
  console.log("");
}

async function createUserFlow(token: string) {
  try {
    const email = await input({
      message: "User email",
      validate: requiredField("Email"),
    });

    const password = await input({
      message: "User password",
      validate: (value) => {
        if (!value || value.trim().length < 6) {
          return "Password must be at least 6 characters";
        }
        return true;
      },
    });

    const name = await input({
      message: "User name",
      validate: requiredField("Name"),
    });

    const role = await select({
      message: "User role",
      choices: [
        { name: "User", value: "user" },
        { name: "Admin", value: "admin" },
      ],
      default: "user",
    });

    const created = await createUserRequest(token, {
      email: email.trim(),
      password: password.trim(),
      name: name.trim(),
      role,
    });

    if (created) {
      console.log(`Created user "${created.email}" (id ${created.id}).`);
    }
  } catch (error) {
    if (isPromptAbortError(error)) {
      console.log("User creation cancelled.");
      return;
    }
    throw error;
  }
}

async function editUserFlow(token: string, user: AdminUser, currentUserId?: string) {
  try {
    const isSelf = Boolean(currentUserId && user.id === currentUserId);
    const banDisabledReason = isSelf ? "Cannot ban your own account" : undefined;
    const unbanDisabledReason = !user.banned
      ? "User is not banned"
      : isSelf
        ? "Cannot unban your own account"
        : undefined;
    const action = await select({
      message: `Edit user "${user.email}"`,
      choices: [
        { name: "Change name", value: "name" },
        { name: "Change role", value: "role" },
        { name: "Change password", value: "password" },
        {
          name: "Ban user",
          value: "ban",
          disabled: banDisabledReason,
        },
        {
          name: "Unban user",
          value: "unban",
          disabled: unbanDisabledReason,
        },
        { name: "Cancel", value: "cancel" },
      ],
    });

    if (action === "cancel") {
      return;
    }

    if (action === "name") {
      const newName = await input({
        message: "New name",
        default: user.name,
        validate: requiredField("Name"),
      });

      const trimmed = newName.trim();
      if (trimmed === user.name) {
        console.log("Name unchanged.");
        return;
      }

      const updated = await updateUserRequest(token, user.id, { name: trimmed });
      if (updated) {
        console.log(`User name updated to "${updated.name}".`);
      }
    } else if (action === "role") {
      await setRoleFlow(token, user);
    } else if (action === "password") {
      const newPassword = await input({
        message: "New password",
        validate: (value) => {
          if (!value || value.trim().length < 6) {
            return "Password must be at least 6 characters";
          }
          return true;
        },
      });

      const result = await setPasswordRequest(token, user.id, newPassword.trim());
      if (result) {
        console.log("Password updated successfully.");
      }
    } else if (action === "ban") {
      await banUserFlow(token, user, currentUserId);
    } else if (action === "unban") {
      const result = await unbanUserRequest(token, user.id);
      if (result) {
        console.log(`User ${user.email} has been unbanned.`);
      }
    }
  } catch (error) {
    if (isPromptAbortError(error)) {
      console.log("Edit cancelled.");
      return;
    }
    throw error;
  }
}

async function setRoleFlow(token: string, user: AdminUser) {
  try {
    const newRole = await select({
      message: `Set role for "${user.email}"`,
      choices: [
        { name: "User", value: "user" },
        { name: "Admin", value: "admin" },
      ],
      default: user.role || "user",
    });

    if (newRole === user.role) {
      console.log("Role unchanged.");
      return;
    }

    const result = await setRoleRequest(token, user.id, newRole);
    if (result) {
      console.log(`User role updated to "${newRole}".`);
    }
  } catch (error) {
    if (isPromptAbortError(error)) {
      console.log("Role change cancelled.");
      return;
    }
    throw error;
  }
}

async function banUserFlow(token: string, user: AdminUser, currentUserId?: string) {
  try {
    if (currentUserId && user.id === currentUserId) {
      console.log("Cannot ban your own account. Please ask another admin.");
      return;
    }
    const reason = await input({
      message: "Ban reason (optional)",
      default: "",
    });

    const duration = await select({
      message: "Ban duration",
      choices: [
        { name: "1 hour", value: 3600 },
        { name: "1 day", value: 86400 },
        { name: "1 week", value: 604800 },
        { name: "1 month", value: 2592000 },
        { name: "Permanent", value: null },
      ],
      default: null,
    });

    const result = await banUserRequest(token, user.id, {
      banReason: reason.trim() || undefined,
      banExpiresIn: duration || undefined,
    });

    if (result) {
      console.log(`User ${user.email} has been banned.`);
    }
  } catch (error) {
    if (isPromptAbortError(error)) {
      console.log("Ban cancelled.");
      return;
    }
    throw error;
  }
}

async function manageUserSessionsFlow(token: string, user: AdminUser) {
  try {
    const sessions = await listUserSessionsRequest(token, user.id);

    if (sessions.length === 0) {
      console.log("No active sessions found for this user.");
      return;
    }

    console.log(`\nActive sessions for ${user.email}:`);
    sessions.forEach((s, i) => {
      console.log(
        `${i + 1}. Token ${s.token.substring(0, 12)}... - Created: ${formatTimestamp(s.createdAt)}`,
      );
    });

    const action = await select({
      message: "Session management",
      choices: [
        { name: "Revoke all sessions", value: "all" },
        { name: "Revoke specific session", value: "one" },
        { name: "Cancel", value: "cancel" },
      ],
    });

    if (action === "cancel") {
      return;
    }

    if (action === "all") {
      const confirmed = await confirm({
        message: "Revoke all sessions for this user?",
        default: false,
      });

      if (!confirmed) {
        return;
      }

      const result = await revokeAllUserSessionsRequest(token, user.id);
      if (result) {
        console.log("All sessions revoked successfully.");
      }
    } else if (action === "one") {
      const sessionToken = await select({
        message: "Select session to revoke",
        choices: sessions.map((s) => ({
          name: `${s.token.substring(0, 16)}... - ${formatTimestamp(s.createdAt)}`,
          value: s.token,
        })),
      });

      const result = await revokeUserSessionRequest(token, user.id, sessionToken);
      if (result) {
        console.log("Session revoked successfully.");
      }
    }
  } catch (error) {
    if (isPromptAbortError(error)) {
      console.log("Session management cancelled.");
      return;
    }
    throw error;
  }
}

// ============================================================================
// API Requests
// ============================================================================

async function fetchUsers(token: string): Promise<AdminUser[]> {
  const response = await apiFetch(
    "/api/admin/users",
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    "app",
  );

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    console.error(`Failed to fetch users: ${message}`);
    return [];
  }

  const data = await parseJSON<{ users: AdminUser[]; total: number }>(response);
  return data?.users || [];
}

async function createUserRequest(
  token: string,
  payload: {
    email: string;
    password: string;
    name: string;
    role?: string;
  },
): Promise<AdminUser | null> {
  const response = await apiFetch(
    "/api/admin/users",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    "app",
  );

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    console.error(`Failed to create user: ${message}`);
    return null;
  }

  const data = await parseJSON<{ user: AdminUser }>(response);
  return data?.user || null;
}

async function updateUserRequest(
  token: string,
  userId: string,
  update: Record<string, any>,
): Promise<AdminUser | null> {
  const response = await apiFetch(
    `/api/admin/users/${userId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(update),
    },
    "app",
  );

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    console.error(`Failed to update user: ${message}`);
    return null;
  }

  const data = await parseJSON<{ user: AdminUser }>(response);
  return data?.user || null;
}

async function setRoleRequest(
  token: string,
  userId: string,
  role: string,
): Promise<AdminUser | null> {
  const response = await apiFetch(
    `/api/admin/users/${userId}/role`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ role }),
    },
    "app",
  );

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    console.error(`Failed to set user role: ${message}`);
    return null;
  }

  const data = await parseJSON<{ user: AdminUser }>(response);
  return data?.user || null;
}

async function setPasswordRequest(
  token: string,
  userId: string,
  password: string,
): Promise<boolean> {
  const response = await apiFetch(
    `/api/admin/users/${userId}/password`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password }),
    },
    "app",
  );

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    console.error(`Failed to set user password: ${message}`);
    return false;
  }

  return true;
}

async function deleteUserRequest(token: string, userId: string): Promise<boolean> {
  const response = await apiFetch(
    `/api/admin/users/${userId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    "app",
  );

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    console.error(`Failed to delete user: ${message}`);
    return false;
  }

  return true;
}

async function banUserRequest(
  token: string,
  userId: string,
  options?: {
    banReason?: string;
    banExpiresIn?: number;
  },
): Promise<AdminUser | null> {
  const response = await apiFetch(
    `/api/admin/users/${userId}/ban`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(options || {}),
    },
    "app",
  );

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    console.error(`Failed to ban user: ${message}`);
    return null;
  }

  const data = await parseJSON<{ user: AdminUser }>(response);
  return data?.user || null;
}

async function unbanUserRequest(token: string, userId: string): Promise<AdminUser | null> {
  const response = await apiFetch(
    `/api/admin/users/${userId}/unban`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    "app",
  );

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    console.error(`Failed to unban user: ${message}`);
    return null;
  }

  const data = await parseJSON<{ user: AdminUser }>(response);
  return data?.user || null;
}

async function listUserSessionsRequest(
  token: string,
  userId: string,
): Promise<AdminSession[]> {
  const response = await apiFetch(
    `/api/admin/users/${userId}/sessions/list`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    },
    "app",
  );

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    console.error(`Failed to list user sessions: ${message}`);
    return [];
  }

  const data = await parseJSON<{ sessions: AdminSession[] }>(response);
  return data?.sessions || [];
}

async function revokeUserSessionRequest(
  token: string,
  userId: string,
  sessionToken: string,
): Promise<boolean> {
  const response = await apiFetch(
    `/api/admin/users/${userId}/sessions/revoke`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sessionToken }),
    },
    "app",
  );

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    console.error(`Failed to revoke user session: ${message}`);
    return false;
  }

  return true;
}

async function revokeAllUserSessionsRequest(
  token: string,
  userId: string,
): Promise<boolean> {
  const response = await apiFetch(
    `/api/admin/users/${userId}/sessions/revoke-all`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    },
    "app",
  );

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    console.error(`Failed to revoke all user sessions: ${message}`);
    return false;
  }

  return true;
}

// ============================================================================
// API Key Management API Requests
// ============================================================================

async function fetchUserApiKeys(token: string, userId: string): Promise<AdminApiKey[]> {
  const response = await apiFetch(
    `/api/admin/api-keys/user/${userId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    "app",
  );

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    console.error(`Failed to fetch API keys: ${message}`);
    return [];
  }

  const data = await parseJSON<{ apiKeys: AdminApiKey[] }>(response);
  return data?.apiKeys || [];
}

async function createApiKeyRequest(
  token: string,
  payload: {
    userId: string;
    name?: string;
    expiresIn?: number;
    prefix?: string;
  },
): Promise<AdminApiKey | null> {
  const response = await apiFetch(
    "/api/admin/api-keys",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    "app",
  );

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    console.error(`Failed to create API key: ${message}`);
    return null;
  }

  const data = await parseJSON<{ apiKey: AdminApiKey }>(response);
  return data?.apiKey || null;
}

async function getApiKeyRequest(token: string, keyId: string): Promise<AdminApiKey | null> {
  const response = await apiFetch(
    `/api/admin/api-keys/${keyId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    "app",
  );

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    console.error(`Failed to get API key: ${message}`);
    return null;
  }

  const data = await parseJSON<{ apiKey: AdminApiKey }>(response);
  return data?.apiKey || null;
}

async function updateApiKeyRequest(
  token: string,
  keyId: string,
  update: {
    name?: string;
    enabled?: boolean;
    remaining?: number;
    refillInterval?: number;
    refillAmount?: number;
  },
): Promise<AdminApiKey | null> {
  const response = await apiFetch(
    `/api/admin/api-keys/${keyId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(update),
    },
    "app",
  );

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    console.error(`Failed to update API key: ${message}`);
    return null;
  }

  const data = await parseJSON<{ apiKey: AdminApiKey }>(response);
  return data?.apiKey || null;
}

async function deleteApiKeyRequest(token: string, keyId: string): Promise<boolean> {
  const response = await apiFetch(
    `/api/admin/api-keys/${keyId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    "app",
  );

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    console.error(`Failed to delete API key: ${message}`);
    return false;
  }

  return true;
}

// ============================================================================
// Command Exports
// ============================================================================

export async function listUsersCommand(token: string) {
  const users = await fetchUsers(token);
  if (users.length === 0) {
    console.log("No users found.");
    return;
  }

  console.log("\n=== Users ===");
  users.forEach((u) => {
    const status = u.banned ? "[BANNED]" : "";
    console.log(`${u.email} (${u.name}) - ${u.role || "user"} ${status}`);
  });
  console.log("");
}

export async function createUserCommand(token: string) {
  await createUserFlow(token);
}

export async function viewUserCommand(token: string, args: string[]) {
  if (args.length === 0) {
    console.log("Usage: /admin user view <email>");
    return;
  }

  const email = args[0];
  const users = await fetchUsers(token);
  const user = users.find((u) => u.email === email);

  if (!user) {
    console.log(`User with email "${email}" not found.`);
    return;
  }

  viewUserDetails(user);
}

export async function setUserRoleCommand(token: string, args: string[]) {
  if (args.length < 2) {
    console.log("Usage: /admin user role <email> <role>");
    return;
  }

  const [email, role] = args;
  const users = await fetchUsers(token);
  const user = users.find((u) => u.email === email);

  if (!user) {
    console.log(`User with email "${email}" not found.`);
    return;
  }

  const result = await setRoleRequest(token, user.id, role);
  if (result) {
    console.log(`User role updated to "${role}".`);
  }
}

export async function banUserCommand(
  token: string,
  args: string[],
  currentUserId?: string | null,
) {
  if (args.length === 0) {
    console.log("Usage: /admin user ban <email> [reason]");
    return;
  }

  const [email, ...reasonParts] = args;
  const users = await fetchUsers(token);
  const user = users.find((u) => u.email === email);

  if (!user) {
    console.log(`User with email "${email}" not found.`);
    return;
  }

  if (currentUserId && user.id === currentUserId) {
    console.log("Cannot ban your own account. Please ask another admin.");
    return;
  }

  const reason = reasonParts.join(" ").trim();
  const result = await banUserRequest(token, user.id, {
    banReason: reason || undefined,
  });

  if (result) {
    console.log(`User ${email} has been banned.`);
  }
}

export async function unbanUserCommand(token: string, args: string[]) {
  if (args.length === 0) {
    console.log("Usage: /admin user unban <email>");
    return;
  }

  const email = args[0];
  const users = await fetchUsers(token);
  const user = users.find((u) => u.email === email);

  if (!user) {
    console.log(`User with email "${email}" not found.`);
    return;
  }

  const result = await unbanUserRequest(token, user.id);
  if (result) {
    console.log(`User ${email} has been unbanned.`);
  }
}

// ============================================================================
// API Key Management Commands
// ============================================================================

export async function listApiKeysCommand(token: string, args: string[]) {
  if (args.length === 0) {
    console.log("Usage: /admin apikey list <email>");
    return;
  }

  const email = args[0];
  const users = await fetchUsers(token);
  const user = users.find((u) => u.email === email);

  if (!user) {
    console.log(`User with email "${email}" not found.`);
    return;
  }

  const apiKeys = await fetchUserApiKeys(token, user.id);

  if (apiKeys.length === 0) {
    console.log(`No API keys found for user ${email}.`);
    return;
  }

  console.log(`\n=== API Keys for ${email} ===`);
  apiKeys.forEach((key) => {
    const status = key.enabled ? "enabled" : "disabled";
    const name = key.name || "(no name)";
    const expires = key.expiresAt ? ` - Expires: ${formatTimestamp(key.expiresAt)}` : "";
    console.log(`${key.id} - ${name} [${status}]${expires}`);
  });
  console.log("");
}

export async function viewApiKeyCommand(token: string, args: string[]) {
  if (args.length === 0) {
    console.log("Usage: /admin apikey view <keyId>");
    return;
  }

  const keyId = args[0];
  const apiKey = await getApiKeyRequest(token, keyId);

  if (!apiKey) {
    console.log(`API key with ID "${keyId}" not found.`);
    return;
  }

  console.log("\n=== API Key Details ===");
  console.log(`ID: ${apiKey.id}`);
  console.log(`Name: ${apiKey.name || "(no name)"}`);
  console.log(`User ID: ${apiKey.userId}`);
  console.log(`Enabled: ${apiKey.enabled ? "Yes" : "No"}`);
  console.log(`Key: ${apiKey.key}`);
  console.log(`Prefix: ${apiKey.prefix || "N/A"}`);
  console.log(`Start: ${apiKey.start || "N/A"}`);

  if (apiKey.rateLimitEnabled) {
    console.log(`Rate Limit: ${apiKey.rateLimitMax} requests per ${apiKey.rateLimitTimeWindow}ms`);
    console.log(`Request Count: ${apiKey.requestCount}`);
  }

  if (apiKey.remaining !== null) {
    console.log(`Remaining: ${apiKey.remaining}`);
  }

  if (apiKey.refillInterval && apiKey.refillAmount) {
    console.log(`Refill: ${apiKey.refillAmount} every ${apiKey.refillInterval}ms`);
  }

  if (apiKey.lastRefillAt) {
    console.log(`Last Refill: ${formatTimestamp(apiKey.lastRefillAt)}`);
  }

  if (apiKey.lastRequest) {
    console.log(`Last Request: ${formatTimestamp(apiKey.lastRequest)}`);
  }

  if (apiKey.expiresAt) {
    console.log(`Expires: ${formatTimestamp(apiKey.expiresAt)}`);
  }

  console.log(`Created: ${formatTimestamp(apiKey.createdAt)}`);
  console.log(`Updated: ${formatTimestamp(apiKey.updatedAt)}`);

  if (apiKey.permissions) {
    console.log(`Permissions: ${apiKey.permissions}`);
  }

  if (apiKey.metadata) {
    console.log(`Metadata: ${apiKey.metadata}`);
  }

  console.log("");
}

export async function createApiKeyCommand(token: string, args: string[]) {
  if (args.length === 0) {
    console.log("Usage: /admin apikey create <email> [name]");
    return;
  }

  const [email, ...nameParts] = args;
  const users = await fetchUsers(token);
  const user = users.find((u) => u.email === email);

  if (!user) {
    console.log(`User with email "${email}" not found.`);
    return;
  }

  try {
    const name = nameParts.length > 0 ? nameParts.join(" ") : undefined;

    const confirmed = await confirm({
      message: `Create API key for user "${email}"?`,
      default: true,
    });

    if (!confirmed) {
      console.log("API key creation cancelled.");
      return;
    }

    const apiKey = await createApiKeyRequest(token, {
      userId: user.id,
      name,
    });

    if (apiKey) {
      console.log(`\nAPI key created successfully!`);
      console.log(`ID: ${apiKey.id}`);
      console.log(`Key: ${apiKey.key}`);
      console.log(`Name: ${apiKey.name || "(no name)"}`);
      console.log("\nIMPORTANT: Save this key now. You won't be able to see it again!");
    }
  } catch (error) {
    if (isPromptAbortError(error)) {
      console.log("API key creation cancelled.");
      return;
    }
    throw error;
  }
}

export async function deleteApiKeyCommand(token: string, args: string[]) {
  if (args.length === 0) {
    console.log("Usage: /admin apikey delete <keyId>");
    return;
  }

  const keyId = args[0];
  const apiKey = await getApiKeyRequest(token, keyId);

  if (!apiKey) {
    console.log(`API key with ID "${keyId}" not found.`);
    return;
  }

  try {
    const confirmed = await confirm({
      message: `Delete API key "${apiKey.name || keyId}"? This action cannot be undone.`,
      default: false,
    });

    if (!confirmed) {
      console.log("API key deletion cancelled.");
      return;
    }

    const deleted = await deleteApiKeyRequest(token, keyId);
    if (deleted) {
      console.log(`API key ${keyId} deleted successfully.`);
    }
  } catch (error) {
    if (isPromptAbortError(error)) {
      console.log("API key deletion cancelled.");
      return;
    }
    throw error;
  }
}

export async function toggleApiKeyCommand(token: string, args: string[]) {
  if (args.length === 0) {
    console.log("Usage: /admin apikey toggle <keyId>");
    return;
  }

  const keyId = args[0];
  const apiKey = await getApiKeyRequest(token, keyId);

  if (!apiKey) {
    console.log(`API key with ID "${keyId}" not found.`);
    return;
  }

  const newStatus = !apiKey.enabled;
  const result = await updateApiKeyRequest(token, keyId, {
    enabled: newStatus,
  });

  if (result) {
    console.log(
      `API key ${keyId} ${newStatus ? "enabled" : "disabled"} successfully.`,
    );
  }
}
