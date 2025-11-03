import { and, cosineDistance, desc, eq, isNotNull } from "drizzle-orm";
import db from "./db.js";
import { memory } from "./schemas/db.js";
import { embedTexts, type Provider } from "./llm.js";

type MemoryInsert = typeof memory.$inferInsert;
type MemorySelect = typeof memory.$inferSelect;

/**
 * Result type for similarity search
 */
export interface SimilaritySearchResult {
  memory: MemorySelect;
  similarity: number;
}

/**
 * Bulk search for similar memories using vector embeddings
 *
 * @param queries - Array of query embeddings (each should be a 1536-dimensional array)
 * @param options - Search options
 * @param options.topK - Number of top results to return per query (default: 5)
 * @param options.userId - Optional user ID to filter results by user
 * @param options.minSimilarity - Minimum similarity threshold (0-1, default: 0)
 * @param options.category - Optional category filter
 * @returns Array of results, one array per query embedding
 */
export async function bulkSearchSimilarMemories(
  queries: number[][],
  options?: {
    topK?: number;
    userId?: string;
    minSimilarity?: number;
    category?: MemoryInsert["category"];
  },
): Promise<SimilaritySearchResult[][]> {
  const topK = options?.topK ?? 5;
  const minSimilarity = options?.minSimilarity ?? 0;

  // Execute all queries in parallel for better performance
  const results = await Promise.all(
    queries.map((queryEmbedding) =>
      searchSimilarMemories(queryEmbedding, {
        topK,
        userId: options?.userId,
        minSimilarity,
        category: options?.category,
      }),
    ),
  );

  return results;
}

/**
 * Search for similar memories using a single query embedding
 *
 * @param queryEmbedding - Query embedding vector (1536 dimensions)
 * @param options - Search options
 * @param options.topK - Number of top results to return (default: 5)
 * @param options.userId - Optional user ID to filter results by user
 * @param options.minSimilarity - Minimum similarity threshold (0-1, default: 0)
 * @param options.category - Optional category filter
 * @returns Array of similar memories with similarity scores
 */
export async function searchSimilarMemories(
  queryEmbedding: number[],
  options?: {
    topK?: number;
    userId?: string;
    minSimilarity?: number;
    category?: MemoryInsert["category"];
  },
): Promise<SimilaritySearchResult[]> {
  const topK = options?.topK ?? 5;
  const minSimilarity = options?.minSimilarity ?? 0;

  // Build where conditions
  const conditions: any[] = [isNotNull(memory.embedding)];
  if (options?.userId) {
    conditions.push(eq(memory.userId, options.userId));
  }
  if (options?.category) {
    conditions.push(eq(memory.category, options.category));
  }

  // Calculate cosine distance (1 - cosine similarity)
  // Note: cosineDistance returns a value where 0 = identical, 2 = opposite
  // We convert to similarity: similarity = 1 - (distance / 2)
  const distance = cosineDistance(memory.embedding, queryEmbedding);

  let query = db
    .select({
      memory: memory,
      distance: distance,
    })
    .from(memory)
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
        memory: row.memory,
        similarity,
      };
    })
    .filter((result) => result.similarity >= minSimilarity);
}

/**
 * Insert a single memory with automatic embedding generation
 * If embedding is provided, uses it; otherwise generates from content
 *
 * @param provider - LLM provider to use for embedding generation ("openai" or "ollama")
 * @param memoryData - Memory data with or without embedding (userId and content are required)
 * @returns Inserted memory record with embedding, or null if content is empty
 */
export async function insertMemory(
  provider: Provider,
  memoryData: Partial<MemoryInsert> & Pick<MemoryInsert, "userId" | "content">,
) {
  const result = await insertMemories(provider, [memoryData]);
  return result.length > 0 ? result[0] : null;
}

/**
 * Create a new memory with embedding
 * Note: Use insertMemory() if you need automatic embedding generation
 */
export async function createMemory(memoryData: MemoryInsert) {
  const inserted = await db.insert(memory).values(memoryData).returning();

  return inserted[0];
}

/**
 * Insert memories with automatic embedding generation
 * If embedding is provided, uses it; otherwise generates from content
 *
 * @param provider - LLM provider to use for embedding generation ("openai" or "ollama")
 * @param memories - Array of memory data with or without embeddings (userId and content are required)
 * @returns Array of inserted memory records with embeddings
 */
export async function insertMemories(
  provider: Provider,
  memories: Array<
    Partial<MemoryInsert> & Pick<MemoryInsert, "userId" | "content">
  >,
) {
  // Separate memories into those with and without embeddings
  const withEmbeddings: MemoryInsert[] = [];
  const withoutEmbeddings: Array<
    Partial<MemoryInsert> & Pick<MemoryInsert, "userId" | "content">
  > = [];

  for (const mem of memories) {
    // Skip memories without content
    if (!mem.content || mem.content.trim().length === 0) {
      continue;
    }

    if (mem.embedding) {
      // Already has embedding, use it directly
      // Type assertion is safe: db auto-generates id, createdAt, updatedAt
      // All other fields (except userId) are optional in schema
      withEmbeddings.push(mem as MemoryInsert);
    } else {
      // Needs embedding generation
      withoutEmbeddings.push(mem);
    }
  }

  // Generate embeddings for memories that need them
  let newlyEmbedded: MemoryInsert[] = [];
  if (withoutEmbeddings.length > 0) {
    // Extract content texts for embedding
    const texts = withoutEmbeddings.map((mem) => mem.content!);

    // Generate embeddings for all texts in bulk
    const embeddings = await embedTexts(provider, texts);

    // Map embeddings back to memory objects
    // Type assertion is safe: db auto-generates id, createdAt, updatedAt
    newlyEmbedded = withoutEmbeddings.map(
      (mem, index) =>
        ({
          ...mem,
          embedding: embeddings[index],
        }) as MemoryInsert,
    );
  }

  // Combine all memories with embeddings
  const allMemories = [...withEmbeddings, ...newlyEmbedded];

  if (allMemories.length === 0) {
    return [];
  }

  // Bulk insert all memories
  return await bulkInsertMemories(allMemories);
}

/**
 * Bulk insert memories
 * Optimized to use batch insert for better performance
 */
export async function bulkInsertMemories(memories: MemoryInsert[]) {
  if (memories.length === 0) return [];

  const inserted = await db.insert(memory).values(memories).returning();

  return inserted;
}

/**
 * Get a single memory by ID with user authorization check
 */
export async function getMemoryById(userId: string, memoryId: number) {
  const result = await db
    .select()
    .from(memory)
    .where(and(eq(memory.userId, userId), eq(memory.id, memoryId)))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

/**
 * Get memories by user ID
 */
export async function getMemoriesByUser(
  userId: string,
  options?: {
    category?: MemoryInsert["category"];
    limit?: number;
    offset?: number;
  },
) {
  const conditions: any[] = [eq(memory.userId, userId)];

  if (options?.category) {
    conditions.push(eq(memory.category, options.category));
  }

  const whereClause =
    conditions.length === 1 ? conditions[0] : and(...conditions);

  const baseQuery = db
    .select()
    .from(memory)
    .where(whereClause)
    .orderBy(desc(memory.createdAt));

  const limitedQuery =
    options?.limit !== undefined ? baseQuery.limit(options.limit) : baseQuery;

  const offsetQuery =
    options?.offset !== undefined
      ? limitedQuery.offset(options.offset)
      : limitedQuery;

  return await offsetQuery;
}

/**
 * Update a memory with user authorization check
 */
export async function updateMemory(
  userId: string,
  memoryId: number,
  updates: Partial<MemoryInsert>,
) {
  const updated = await db
    .update(memory)
    .set(updates)
    .where(and(eq(memory.id, memoryId), eq(memory.userId, userId)))
    .returning();

  return updated.length > 0 ? updated[0] : null;
}

/**
 * Delete a memory with user authorization check
 */
export async function deleteMemory(userId: string, memoryId: number) {
  const deleted = await db
    .delete(memory)
    .where(and(eq(memory.id, memoryId), eq(memory.userId, userId)))
    .returning();

  return deleted.length > 0 ? deleted[0] : null;
}
