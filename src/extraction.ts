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
 * @param provider - LLM provider to use ("openai" or "ollama")
 * @returns Object containing extracted facts count, updated memories count, and extracted messages count
 */
export async function extractMemoriesForUser(
  userId: string,
  provider: Provider,
): Promise<{ factsExtracted: number; memoriesUpdated: number; messagesExtracted: number }> {
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
    provider === "openai" ? parseOpenAIStructured : parseOllamaStructured;

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
  // Generate embeddings for all facts using Dashscope (the only embedding provider)
  const factTexts = parsedFacts.facts.map((fact) => fact.text);
  const factEmbeddings = await embedTexts("dashscope", factTexts);

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

  // Step 5: Apply memory decisions and mark messages (within transaction)
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let memoriesUpdated = 0;

    for (const decision of parsedDecisions.memory) {
      const decisionId = parseInt(decision.id, 10);

      if (decision.event === "ADD") {
        // Find the corresponding fact by unified ID
        const factIndex = decisionId - startFactId;
        if (factIndex >= 0 && factIndex < unifiedNewFacts.length) {
          const fact = parsedFacts.facts[factIndex];

          // Insert new memory with the fact's text (or decision text if provided)
          // Always use "dashscope" for embeddings (the only embedding provider)
          await insertMemories("dashscope", [
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

          // Generate embedding for updated content using Dashscope (the only embedding provider)
          const [updatedEmbedding] = await embedTexts("dashscope", [
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
    }

    // Mark all messages as extracted
    const messageIds = unextractedMessages.map((msg) => msg.id);
    for (const msgId of messageIds) {
      await client.query(
        `UPDATE message SET extracted = true, updated_at = NOW() WHERE id = $1`,
        [msgId],
      );
    }

    await client.query("COMMIT");

    return {
      factsExtracted: parsedFacts.facts.length,
      memoriesUpdated: memoriesUpdated,
      messagesExtracted: unextractedMessages.length,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
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
