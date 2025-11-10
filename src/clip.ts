import { and, cosineDistance, isNotNull, eq } from "drizzle-orm";
import db from "./db.js";
import { clip } from "./schemas/db.js";
import { embedTexts, type EmbeddingProvider } from "./llm.js";

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
 * @param provider - Embedding provider to use for embedding generation ("openai", "ollama", or "dashscope")
 * @param queryText - Text query to search for
 * @param options - Search options
 * @returns Array of similar clips with similarity scores
 */
export async function searchSimilarClipsByText(
  provider: EmbeddingProvider,
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
