import { eq } from "drizzle-orm";
import db, { pool } from "./db.js";
import { message } from "./schemas/db.js";
import { getMessagesByUser } from "./message.js";
import {
  embedTexts,
  type Provider,
  parseOpenAIStructured,
  parseOllamaStructured,
} from "./llm.js";
import {
  bulkSearchSimilarMemories,
  insertMemories,
  updateMemory,
} from "./memory.js";
import {
  getFactRetrievalMessages,
  getUpdateMemoryMessages,
  FactRetrievalSchema,
  MemoryUpdateSchema,
  parseMessages,
} from "./prompts/extraction.js";
import z from "zod";

/**
 * Memory extraction helper function
 * Extracts memories from unextracted messages for a given user
 *
 * @param userId - The user ID to extract memories for
 * @param embeddingProvider - Embedding provider to use for generating embeddings
 * @param llmProvider - LLM provider to use for fact extraction and decision making
 * @returns Object containing extracted facts count, updated memories count, and extracted messages count
 */
export async function extractMemoriesForUser(
  userId: string,
  embeddingProvider: Provider,
  llmProvider?: Provider,
): Promise<{ factsExtracted: number; memoriesUpdated: number; messagesExtracted: number }> {
  // If llmProvider is not specified, use embeddingProvider for both
  const actualLlmProvider = llmProvider ?? embeddingProvider;
  // Step 1: Fetch unextracted messages from the given user
  const unextractedMessages = await getMessagesByUser(userId, {
    extracted: false,
  });

  // If no unextracted messages, return early
  if (unextractedMessages.length === 0) {
    return { factsExtracted: 0, memoriesUpdated: 0, messagesExtracted: 0 };
  }

  // Parse messages into a single string for fact extraction
  const messageContents = unextractedMessages.map(
    (msg) => `${msg.role}: ${msg.content}`,
  );
  const parsedMessages = parseMessages(messageContents);

  // Step 2: Extract facts from conversation with LLM
  const factExtractionPrompt = getFactRetrievalMessages(parsedMessages);

  const parseFn =
    actualLlmProvider === "openai"
      ? parseOpenAIStructured
      : parseOllamaStructured;

  const factExtractionResult = await parseFn({
    prompt: factExtractionPrompt,
    format: {
      name: "fact_retrieval",
      schema: z.toJSONSchema(FactRetrievalSchema),
    },
  });

  // Parse extracted facts
  const parsedFacts = FactRetrievalSchema.parse(
    JSON.parse(factExtractionResult),
  );

  // If no facts extracted, mark messages as extracted and return
  if (parsedFacts.facts.length === 0) {
    await markMessagesAsExtracted(unextractedMessages.map((msg) => msg.id));
    return { factsExtracted: 0, memoriesUpdated: 0, messagesExtracted: unextractedMessages.length };
  }

  // Step 3: Prepare similarity context (with unified IDs: 1, 2, 3...)
  // Generate embeddings for all facts
  const factTexts = parsedFacts.facts.map((fact) => fact.text);
  const factEmbeddings = await embedTexts(embeddingProvider, factTexts);

  // Search for similar memories for each fact
  const similarMemoriesResults = await bulkSearchSimilarMemories(
    factEmbeddings,
    {
      topK: 5,
      userId: userId,
      minSimilarity: 0.7, // Only consider memories with 70%+ similarity
    },
  );

  // Collect all unique similar memories across all facts
  const uniqueMemoriesMap = new Map<number, { id: number; content: string }>();
  for (const results of similarMemoriesResults) {
    for (const result of results) {
      if (!uniqueMemoriesMap.has(result.memory.id)) {
        uniqueMemoriesMap.set(result.memory.id, {
          id: result.memory.id,
          content: result.memory.content || "",
        });
      }
    }
  }

  // Create unified ID mapping for existing memories (1, 2, 3...)
  const existingMemories = Array.from(uniqueMemoriesMap.values());
  const unifiedExistingMemories = existingMemories.map((mem, index) => ({
    id: String(index + 1),
    text: mem.content,
    originalId: mem.id,
  }));

  // Create unified ID mapping for new facts (continuing from existing memories count)
  const startFactId = existingMemories.length + 1;
  const unifiedNewFacts = parsedFacts.facts.map((fact, index) => ({
    id: String(startFactId + index),
    text: fact.text,
    category: fact.category,
    importance: fact.importance,
    confidence: fact.confidence,
  }));

  // Step 4: Decide memory actions with LLM
  const memoryUpdatePrompt = getUpdateMemoryMessages(
    unifiedExistingMemories,
    unifiedNewFacts,
  );

  const memoryUpdateResult = await parseFn({
    prompt: memoryUpdatePrompt,
    format: {
      name: "memory_update",
      schema: z.toJSONSchema(MemoryUpdateSchema),
    },
  });

  // Parse memory update decisions
  const parsedDecisions = MemoryUpdateSchema.parse(
    JSON.parse(memoryUpdateResult),
  );

  // Step 5: Apply memory decisions and mark messages
  // Note: Memory operations (insertMemories, updateMemory) use separate connections
  // from the connection pool, so they're not part of a single transaction.
  // We track successes and failures to provide accurate counts.
  let memoriesUpdated = 0;
  const failedOperations: Array<{ decision: string; error: string }> = [];

  try {
    // Process memory decisions
    for (const decision of parsedDecisions.memory) {
      try {
        const decisionId = parseInt(decision.id, 10);

        if (decision.event === "ADD") {
          // Find the corresponding fact by unified ID
          const factIndex = decisionId - startFactId;
          if (factIndex >= 0 && factIndex < unifiedNewFacts.length) {
            const fact = parsedFacts.facts[factIndex];

            // Insert new memory with the fact's text (or decision text if provided)
            await insertMemories(embeddingProvider, [
              {
                userId: userId,
                content: decision.text || fact.text,
                category: fact.category,
                importance: fact.importance,
                confidence: fact.confidence,
                action: "ADD",
              },
            ]);
            memoriesUpdated++;
          }
        } else if (decision.event === "UPDATE") {
          // Find the corresponding existing memory by unified ID
          const memoryIndex = decisionId - 1;
          if (memoryIndex >= 0 && memoryIndex < unifiedExistingMemories.length) {
            const originalMemoryId =
              unifiedExistingMemories[memoryIndex].originalId;

            // Find the matching fact (if any) to get updated metadata
            // For UPDATE events, we need to find which fact triggered this update
            // We'll use the first fact in the list for metadata (simplified approach)
            const fact = parsedFacts.facts[0]; // TODO: Improve this mapping logic

            // Generate embedding for updated content
            const [updatedEmbedding] = await embedTexts(embeddingProvider, [
              decision.text,
            ]);

            // Update the memory
            await updateMemory(userId, originalMemoryId, {
              prevContent: unifiedExistingMemories[memoryIndex].text,
              content: decision.text,
              category: fact.category,
              importance: fact.importance,
              confidence: fact.confidence,
              action: "UPDATE",
              embedding: updatedEmbedding,
            });
            memoriesUpdated++;
          }
        }
      } catch (operationError) {
        // Log individual operation failure but continue processing
        const errorMessage =
          operationError instanceof Error
            ? operationError.message
            : String(operationError);

        console.error(
          `Failed to process memory decision (id: ${decision.id}, event: ${decision.event}):`,
          operationError,
        );

        failedOperations.push({
          decision: `${decision.event} ${decision.id}`,
          error: errorMessage,
        });

        // Continue processing other decisions instead of failing entirely
      }
    }

    // Mark all messages as extracted using a single batch update
    const messageIds = unextractedMessages.map((msg) => msg.id);
    if (messageIds.length > 0) {
      // Use raw query with ANY to update all messages in a single query
      // This is more efficient than N individual updates
      const client = await pool.connect();
      try {
        await client.query(
          `UPDATE message SET extracted = true, updated_at = NOW() WHERE id = ANY($1::int[])`,
          [messageIds],
        );
      } finally {
        client.release();
      }
    }

    // Log failed operations if any
    if (failedOperations.length > 0) {
      console.warn(
        `Extraction completed with ${failedOperations.length} failed operation(s):`,
        failedOperations,
      );
    }

    return {
      factsExtracted: parsedFacts.facts.length,
      memoriesUpdated: memoriesUpdated,
      messagesExtracted: unextractedMessages.length,
    };
  } catch (error) {
    // Fatal error - log and rethrow
    console.error("Fatal error during memory extraction:", error);
    throw error;
  }
}

/**
 * Helper function to mark messages as extracted (without transaction)
 */
async function markMessagesAsExtracted(messageIds: number[]): Promise<void> {
  if (messageIds.length === 0) return;

  for (const msgId of messageIds) {
    await db
      .update(message)
      .set({ extracted: true })
      .where(eq(message.id, msgId));
  }
}
