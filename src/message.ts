import { and, asc, desc, eq } from "drizzle-orm";
import db from "./db.js";
import { message, story } from "./schemas/db.js";

/**
 * Query messages by story ID, ordered by creation time
 * @param storyId - The story ID to query messages for
 * @param options - Optional parameters for pagination
 * @param options.limit - Maximum number of messages to return (defaults to all)
 * @param options.offset - Number of messages to skip (defaults to 0)
 * @param options.lastN - If provided, returns only the last N messages (most recent)
 */
export async function getMessagesByStory(
  storyId: number,
  options?: { limit?: number; offset?: number; lastN?: number },
) {
  const baseQuery = db
    .select({ role: message.role, content: message.content })
    .from(message)
    .where(eq(message.storyId, storyId));

  // If lastN is specified, get the most recent N messages
  if (options?.lastN !== undefined) {
    const recentMessages = await db
      .select({ role: message.role, content: message.content })
      .from(message)
      .where(eq(message.storyId, storyId))
      .orderBy(desc(message.createdAt))
      .limit(options.lastN);

    // Reverse to get chronological order (oldest to newest)
    return recentMessages.reverse();
  }

  const orderedQuery = baseQuery.orderBy(asc(message.createdAt));

  const limitedQuery =
    options?.limit !== undefined
      ? orderedQuery.limit(options.limit)
      : orderedQuery;

  const finalQuery =
    options?.offset !== undefined
      ? limitedQuery.offset(options.offset)
      : limitedQuery;

  return await finalQuery;
}

/**
 * Query messages by user with optional filters
 * @param userId - The user ID to query messages for
 * @param filters - Optional filters for storyId and extracted status
 * @param options - Optional parameters for pagination
 * @param options.limit - Maximum number of messages to return (defaults to all)
 * @param options.offset - Number of messages to skip (defaults to 0)
 */
export async function getMessagesByUser(
  userId: string,
  filters?: { storyId?: number; extracted?: boolean },
  options?: { limit?: number; offset?: number },
) {
  const conditions = [eq(story.userId, userId)];

  if (filters?.storyId !== undefined) {
    conditions.push(eq(message.storyId, filters.storyId));
  }

  if (filters?.extracted !== undefined) {
    conditions.push(eq(message.extracted, filters.extracted));
  }

  const whereClause =
    conditions.length === 1 ? conditions[0] : and(...conditions);

  const baseQuery = db
    .select({
      id: message.id,
      storyId: message.storyId,
      role: message.role,
      content: message.content,
      extracted: message.extracted,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
    })
    .from(message)
    .innerJoin(story, eq(message.storyId, story.id))
    .where(whereClause)
    .orderBy(asc(message.createdAt));

  const limitedQuery =
    options?.limit !== undefined
      ? baseQuery.limit(options.limit)
      : baseQuery;

  const finalQuery =
    options?.offset !== undefined
      ? limitedQuery.offset(options.offset)
      : limitedQuery;

  return await finalQuery;
}

/**
 * Bulk insert messages within a transaction
 * Optimized to use batch insert for better performance
 */
export async function bulkInsertMessages(
  messages: Array<{
    storyId: number;
    role: "system" | "user" | "assistant";
    content: string;
  }>,
) {
  // Filter out empty messages and prepare values
  const validMessages = messages
    .filter((msg) => msg.content.trim().length > 0)
    .map((msg) => ({
      storyId: msg.storyId,
      role: msg.role,
      content: msg.content.trim(),
    }));

  // Batch insert all messages at once (much faster than sequential inserts)
  if (validMessages.length > 0) {
    await db.insert(message).values(validMessages);
  }
}

/**
 * Delete all messages for a story with user authorization check
 * @param userId - The user ID to verify story ownership
 * @param storyId - The story ID to delete messages for
 * @returns The number of messages deleted
 */
export async function deleteMessagesByStory(userId: string, storyId: number) {
  // Verify story ownership before deleting messages
  const storyResult = await db
    .select({ id: story.id })
    .from(story)
    .where(and(eq(story.id, storyId), eq(story.userId, userId)))
    .limit(1);

  // If story doesn't exist or doesn't belong to user, return 0
  if (storyResult.length === 0) {
    return 0;
  }

  const result = await db.delete(message).where(eq(message.storyId, storyId));
  return result.rowCount ?? 0;
}
