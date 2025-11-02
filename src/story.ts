import { and, eq } from "drizzle-orm";
import db from "./db.js";
import { story } from "./schema/db.js";

type StoryInsert = typeof story.$inferInsert;

/**
 * Query all stories by user ID
 */
export async function getStoriesByUser(userId: string) {
  return await db.select().from(story).where(eq(story.userId, userId));
}

/**
 * Get a single story by ID with user authorization check
 */
export async function getStoryById(userId: string, storyId: number) {
  const result = await db
    .select()
    .from(story)
    .where(and(eq(story.userId, userId), eq(story.id, storyId)))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

/**
 * Check if a story exists for a user
 */
export async function storyExists(userId: string, storyId: number) {
  const result = await db
    .select({ id: story.id })
    .from(story)
    .where(and(eq(story.userId, userId), eq(story.id, storyId)))
    .limit(1);

  return result.length > 0;
}

/**
 * Create a new story
 */
export async function createStory(
  userId: string,
  name: string,
  provider: "openai" | "ollama",
  handler: string,
) {
  const inserted = await db
    .insert(story)
    .values({
      userId,
      name,
      provider,
      handler,
    })
    .returning();

  return inserted[0];
}

/**
 * Update a story with user authorization check
 */
export async function updateStory(
  userId: string,
  storyId: number,
  updates: Partial<StoryInsert>,
) {
  const updated = await db
    .update(story)
    .set(updates)
    .where(and(eq(story.userId, userId), eq(story.id, storyId)))
    .returning();

  return updated.length > 0 ? updated[0] : null;
}

/**
 * Delete a story with user authorization check
 */
export async function deleteStory(userId: string, storyId: number) {
  const deleted = await db
    .delete(story)
    .where(and(eq(story.userId, userId), eq(story.id, storyId)))
    .returning();

  return deleted.length > 0 ? deleted[0] : null;
}

/**
 * Get story with provider and handler info for streaming
 */
export async function getStoryForStreaming(userId: string, storyId: number) {
  const result = await db
    .select({
      id: story.id,
      provider: story.provider,
      handler: story.handler,
    })
    .from(story)
    .where(and(eq(story.userId, userId), eq(story.id, storyId)))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}
