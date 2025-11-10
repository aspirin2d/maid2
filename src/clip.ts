import { and, cosineDistance, desc, eq, isNotNull } from "drizzle-orm";
import db from "./db.js";
import { clip } from "./schemas/db.js";
import { embedTexts, type Provider } from "./llm.js";

type ClipInsert = typeof clip.$inferInsert;
type ClipSelect = typeof clip.$inferSelect;

/**
 * Result type for similarity search
 */
export interface SimilaritySearchResult {
  clip: ClipSelect;
  similarity: number;
}

/**
 * Bulk search for similar clips using vector embeddings
 *
 * @param queries - Array of query embeddings (each should be a 1536-dimensional array)
 * @param options - Search options
 * @param options.topK - Number of top results to return per query (default: 5)
 * @param options.originId - Optional origin ID to filter results
 * @param options.minSimilarity - Minimum similarity threshold (0-1, default: 0)
 * @returns Array of results, one array per query embedding
 */
export async function bulkSearchSimilarClips(
  queries: number[][],
  options?: {
    topK?: number;
    originId?: string;
    minSimilarity?: number;
  },
): Promise<SimilaritySearchResult[][]> {
  const topK = options?.topK ?? 5;
  const minSimilarity = options?.minSimilarity ?? 0;

  // Execute all queries in parallel for better performance
  const results = await Promise.all(
    queries.map((queryEmbedding) =>
      searchSimilarClips(queryEmbedding, {
        topK,
        originId: options?.originId,
        minSimilarity,
      }),
    ),
  );

  return results;
}

/**
 * Search for similar clips using a single query embedding
 *
 * @param queryEmbedding - Query embedding vector (1536 dimensions)
 * @param options - Search options
 * @param options.topK - Number of top results to return (default: 5)
 * @param options.originId - Optional origin ID to filter results
 * @param options.minSimilarity - Minimum similarity threshold (0-1, default: 0)
 * @returns Array of similar clips with similarity scores
 */
export async function searchSimilarClips(
  queryEmbedding: number[],
  options?: {
    topK?: number;
    originId?: string;
    minSimilarity?: number;
  },
): Promise<SimilaritySearchResult[]> {
  const topK = options?.topK ?? 5;
  const minSimilarity = options?.minSimilarity ?? 0;

  // Build where conditions
  const conditions: any[] = [isNotNull(clip.embedding)];
  if (options?.originId) {
    conditions.push(eq(clip.originId, options.originId));
  }

  // Calculate cosine distance (1 - cosine similarity)
  // Note: cosineDistance returns a value where 0 = identical, 2 = opposite
  // We convert to similarity: similarity = 1 - (distance / 2)
  const distance = cosineDistance(clip.embedding, queryEmbedding);

  let query = db
    .select({
      clip: clip,
      distance: distance,
    })
    .from(clip)
    .$dynamic();

  // Apply filters
  const whereClause =
    conditions.length === 1 ? conditions[0] : and(...conditions);
  query = query.where(whereClause);

  // Order by similarity (lower distance = higher similarity)
  // Note: We limit to topK first, then filter by minSimilarity
  // This returns the top K most similar results that meet the threshold
  const results = await query.orderBy(distance).limit(topK);

  // Convert distance to similarity score and filter by minimum similarity
  return results
    .map((row) => {
      // Convert cosine distance to similarity (0-1 scale)
      // cosineDistance returns values typically in range [0, 2]
      const similarity = 1 - Number(row.distance) / 2;
      return {
        clip: row.clip,
        similarity,
      };
    })
    .filter((result) => result.similarity >= minSimilarity);
}

/**
 * Search for similar clips using text query
 * Automatically generates embedding from the query text
 *
 * @param provider - LLM provider to use for embedding generation ("openai" or "ollama")
 * @param queryText - Text query to search for
 * @param options - Search options
 * @returns Array of similar clips with similarity scores
 */
export async function searchSimilarClipsByText(
  provider: Provider,
  queryText: string,
  options?: {
    topK?: number;
    originId?: string;
    minSimilarity?: number;
  },
): Promise<SimilaritySearchResult[]> {
  // Generate embedding for the query text
  const [queryEmbedding] = await embedTexts(provider, [queryText]);

  return searchSimilarClips(queryEmbedding, options);
}

/**
 * Insert a single clip with automatic embedding generation
 * If embedding is provided, uses it; otherwise generates from description
 *
 * @param provider - LLM provider to use for embedding generation ("openai" or "ollama")
 * @param clipData - Clip data with or without embedding (description is required)
 * @returns Inserted clip record with embedding, or null if description is empty
 */
export async function insertClip(
  provider: Provider,
  clipData: Partial<ClipInsert> & Pick<ClipInsert, "originId" | "startFrame" | "endFrame" | "videoUrl" | "description">,
) {
  const result = await insertClips(provider, [clipData]);
  return result.length > 0 ? result[0] : null;
}

/**
 * Create a new clip with embedding
 * Note: Use insertClip() if you need automatic embedding generation
 */
export async function createClip(clipData: ClipInsert) {
  const inserted = await db.insert(clip).values(clipData).returning();

  return inserted[0];
}

/**
 * Insert clips with automatic embedding generation
 * If embedding is provided, uses it; otherwise generates from description
 *
 * @param provider - LLM provider to use for embedding generation ("openai" or "ollama")
 * @param clips - Array of clip data with or without embeddings (description is required)
 * @returns Array of inserted clip records with embeddings
 */
export async function insertClips(
  provider: Provider,
  clips: Array<
    Partial<ClipInsert> & Pick<ClipInsert, "originId" | "startFrame" | "endFrame" | "videoUrl" | "description">
  >,
) {
  // Separate clips into those with and without embeddings
  const withEmbeddings: ClipInsert[] = [];
  const withoutEmbeddings: Array<
    Partial<ClipInsert> & Pick<ClipInsert, "originId" | "startFrame" | "endFrame" | "videoUrl" | "description">
  > = [];

  for (const clipItem of clips) {
    // Skip clips without description
    if (!clipItem.description || clipItem.description.trim().length === 0) {
      continue;
    }

    if (clipItem.embedding) {
      // Already has embedding, use it directly
      // Type assertion is safe: db auto-generates id, createdAt, updatedAt
      withEmbeddings.push(clipItem as ClipInsert);
    } else {
      // Needs embedding generation
      withoutEmbeddings.push(clipItem);
    }
  }

  // Generate embeddings for clips that need them
  let newlyEmbedded: ClipInsert[] = [];
  if (withoutEmbeddings.length > 0) {
    // Extract description texts for embedding
    const texts = withoutEmbeddings.map((clipItem) => clipItem.description!);

    // Generate embeddings for all texts in bulk
    const embeddings = await embedTexts(provider, texts);

    // Map embeddings back to clip objects
    // Type assertion is safe: db auto-generates id, createdAt, updatedAt
    newlyEmbedded = withoutEmbeddings.map(
      (clipItem, index) =>
        ({
          ...clipItem,
          embedding: embeddings[index],
        }) as ClipInsert,
    );
  }

  // Combine all clips with embeddings
  const allClips = [...withEmbeddings, ...newlyEmbedded];

  if (allClips.length === 0) {
    return [];
  }

  // Bulk insert all clips
  return await bulkInsertClips(allClips);
}

/**
 * Bulk insert clips
 * Optimized to use batch insert for better performance
 */
export async function bulkInsertClips(clips: ClipInsert[]) {
  if (clips.length === 0) return [];

  const inserted = await db.insert(clip).values(clips).returning();

  return inserted;
}

/**
 * Get a single clip by ID
 */
export async function getClipById(clipId: number) {
  const result = await db
    .select()
    .from(clip)
    .where(eq(clip.id, clipId))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

/**
 * Get clips by origin ID
 */
export async function getClipsByOrigin(
  originId: string,
  options?: {
    limit?: number;
    offset?: number;
  },
) {
  const baseQuery = db
    .select()
    .from(clip)
    .where(eq(clip.originId, originId))
    .orderBy(desc(clip.createdAt));

  const limitedQuery =
    options?.limit !== undefined ? baseQuery.limit(options.limit) : baseQuery;

  const offsetQuery =
    options?.offset !== undefined
      ? limitedQuery.offset(options.offset)
      : limitedQuery;

  return await offsetQuery;
}

/**
 * Get clips by frame range
 * Find clips that overlap with the specified frame range
 */
export async function getClipsByFrameRange(
  originId: string,
  startFrame: number,
  endFrame: number,
  options?: {
    limit?: number;
  },
) {
  // Clips overlap if: clip.startFrame <= endFrame AND clip.endFrame >= startFrame
  const results = await db
    .select()
    .from(clip)
    .where(
      and(
        eq(clip.originId, originId),
        // Using raw SQL for range overlap check
        // A clip overlaps if it starts before or at our end, and ends at or after our start
      ),
    )
    .orderBy(clip.startFrame)
    .limit(options?.limit ?? 100);

  // Filter in JavaScript for range overlap
  // (Drizzle doesn't have a built-in range overlap operator)
  return results.filter(
    (c) => c.startFrame <= endFrame && c.endFrame >= startFrame,
  );
}

/**
 * Update a clip
 * If description is updated, regenerate embedding
 */
export async function updateClip(
  clipId: number,
  updates: Partial<ClipInsert>,
  provider?: Provider,
) {
  // If description is updated and provider is specified, regenerate embedding
  if (updates.description && provider) {
    const [newEmbedding] = await embedTexts(provider, [updates.description]);
    updates.embedding = newEmbedding;
  }

  const updated = await db
    .update(clip)
    .set(updates)
    .where(eq(clip.id, clipId))
    .returning();

  return updated.length > 0 ? updated[0] : null;
}

/**
 * Delete a clip
 */
export async function deleteClip(clipId: number) {
  const deleted = await db
    .delete(clip)
    .where(eq(clip.id, clipId))
    .returning();

  return deleted.length > 0 ? deleted[0] : null;
}

/**
 * Delete all clips for a specific origin
 */
export async function deleteClipsByOrigin(originId: string) {
  const deleted = await db
    .delete(clip)
    .where(eq(clip.originId, originId))
    .returning();

  return deleted;
}
