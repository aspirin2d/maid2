import { randomBytes, createHash } from "crypto";
import { eq, and } from "drizzle-orm";
import db from "./db.js";
import { apiKey } from "./schemas/db.js";

/**
 * API Key Format: maid2_[32 random hex characters]
 * Example: maid2_a1b2c3d4e5f6...
 */

const API_KEY_PREFIX = "maid2_";
const KEY_LENGTH = 32; // bytes (64 hex characters after prefix)

/**
 * Generates a new API key with the format: maid2_[random hex]
 * @returns The generated API key string
 */
export function generateApiKey(): string {
  const randomHex = randomBytes(KEY_LENGTH).toString("hex");
  return `${API_KEY_PREFIX}${randomHex}`;
}

/**
 * Hashes an API key for secure storage
 * Uses SHA-256 for one-way hashing
 * @param key The API key to hash
 * @returns The hashed key
 */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Validates the format of an API key
 * @param key The API key to validate
 * @returns True if the key has valid format
 */
export function isValidKeyFormat(key: string): boolean {
  if (!key.startsWith(API_KEY_PREFIX)) {
    return false;
  }

  const keyPart = key.slice(API_KEY_PREFIX.length);
  // Should be 64 hex characters (32 bytes)
  return /^[a-f0-9]{64}$/i.test(keyPart);
}

/**
 * Creates a new API key for a user
 * @param userId The user ID to create the key for
 * @param name Optional name/description for the key
 * @param expiresAt Optional expiration date
 * @returns Object containing the plain key and the created record (without the hash)
 */
export async function createApiKey(
  userId: string,
  name?: string,
  expiresAt?: Date,
) {
  const plainKey = generateApiKey();
  const hashedKey = hashApiKey(plainKey);

  const [created] = await db
    .insert(apiKey)
    .values({
      userId,
      keyHash: hashedKey,
      name: name || null,
      expiresAt: expiresAt || null,
    })
    .returning();

  // Return the plain key (only time it's available) and the record
  return {
    key: plainKey,
    record: {
      id: created.id,
      userId: created.userId,
      name: created.name,
      expiresAt: created.expiresAt,
      lastUsedAt: created.lastUsedAt,
      createdAt: created.createdAt,
    },
  };
}

/**
 * Validates an API key and returns the associated user ID if valid
 * Also updates the lastUsedAt timestamp
 * @param key The API key to validate
 * @returns The user ID if valid, null otherwise
 */
export async function validateApiKey(
  key: string,
): Promise<{ userId: string; keyId: number } | null> {
  // Check format first
  if (!isValidKeyFormat(key)) {
    return null;
  }

  const hashedKey = hashApiKey(key);

  // Find the key
  const [found] = await db
    .select({
      id: apiKey.id,
      userId: apiKey.userId,
      expiresAt: apiKey.expiresAt,
      revokedAt: apiKey.revokedAt,
    })
    .from(apiKey)
    .where(eq(apiKey.keyHash, hashedKey))
    .limit(1);

  if (!found) {
    return null;
  }

  // Check if revoked
  if (found.revokedAt) {
    return null;
  }

  // Check if expired
  if (found.expiresAt && found.expiresAt < new Date()) {
    return null;
  }

  // Update last used timestamp
  await db
    .update(apiKey)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKey.id, found.id));

  return {
    userId: found.userId,
    keyId: found.id,
  };
}

/**
 * Revokes an API key
 * @param keyId The ID of the key to revoke
 * @param userId Optional user ID to verify ownership
 */
export async function revokeApiKey(
  keyId: number,
  userId?: string,
): Promise<boolean> {
  const conditions = userId
    ? and(eq(apiKey.id, keyId), eq(apiKey.userId, userId))
    : eq(apiKey.id, keyId);

  const result = await db
    .update(apiKey)
    .set({ revokedAt: new Date() })
    .where(conditions!)
    .returning();

  return result.length > 0;
}

/**
 * Lists all API keys for a user (without the key hash)
 * @param userId The user ID
 * @param includeRevoked Whether to include revoked keys
 */
export async function listApiKeys(userId: string, includeRevoked = false) {
  let query = db
    .select({
      id: apiKey.id,
      name: apiKey.name,
      expiresAt: apiKey.expiresAt,
      lastUsedAt: apiKey.lastUsedAt,
      revokedAt: apiKey.revokedAt,
      createdAt: apiKey.createdAt,
    })
    .from(apiKey)
    .where(eq(apiKey.userId, userId));

  const results = await query;

  if (!includeRevoked) {
    return results.filter((k) => !k.revokedAt);
  }

  return results;
}

/**
 * Deletes an API key permanently
 * @param keyId The ID of the key to delete
 * @param userId Optional user ID to verify ownership
 */
export async function deleteApiKey(
  keyId: number,
  userId?: string,
): Promise<boolean> {
  const conditions = userId
    ? and(eq(apiKey.id, keyId), eq(apiKey.userId, userId))
    : eq(apiKey.id, keyId);

  const result = await db
    .delete(apiKey)
    .where(conditions!)
    .returning();

  return result.length > 0;
}
