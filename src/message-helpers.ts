import { and, asc, eq } from "drizzle-orm";
import db from "./db.js";
import { message, story } from "./schema/db.js";

/**
 * Query messages by story ID, ordered by creation time
 */
export async function getMessagesByStory(storyId: number) {
  return await db
    .select({ role: message.role, content: message.content })
    .from(message)
    .where(eq(message.storyId, storyId))
    .orderBy(asc(message.createdAt));
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
 */
export async function bulkInsertMessages(
  messages: Array<{
    storyId: number;
    role: "system" | "user" | "assistant";
    content: string;
  }>,
) {
  await db.transaction(async (tx) => {
    for (const msg of messages) {
      if (msg.content.trim().length > 0) {
        await tx.insert(message).values({
          storyId: msg.storyId,
          role: msg.role,
          content: msg.content.trim(),
        });
      }
    }
  });
}
