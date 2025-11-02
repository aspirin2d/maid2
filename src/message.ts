import { and, asc, desc, eq } from "drizzle-orm";
import db from "./db.js";
import { message, story } from "./schema/db.js";

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
  let query = db
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

  // Standard pagination
  query = query.orderBy(asc(message.createdAt));

  if (options?.limit !== undefined) {
    query = query.limit(options.limit);
  }

  if (options?.offset !== undefined) {
    query = query.offset(options.offset);
  }

  return await query;
}

/**
 * Query messages by user with optional filters
 */
export async function getMessagesByUser(
  userId: string,
  filters?: { storyId?: number; extracted?: boolean },
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

  return await db
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
    .where(whereClause);
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
