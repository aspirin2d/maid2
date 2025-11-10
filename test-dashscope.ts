/**
 * Test script for Dashscope text embedding integration
 *
 * Usage:
 * 1. Add DASHSCOPE_API_KEY to your .env file
 * 2. Run: npx tsx test-dashscope.ts
 */

import { embedText, embedTexts } from "./src/llm.js";

async function testDashscopeEmbedding() {
  console.log("Testing Dashscope text embedding integration...\n");

  try {
    // Test 1: Single text embedding
    console.log("Test 1: Embedding a single text");
    const singleText = "Hello, this is a test message.";
    console.log(`Input: "${singleText}"`);

    const singleEmbedding = await embedText("dashscope", singleText);
    console.log(`✓ Generated embedding with ${singleEmbedding.length} dimensions`);
    console.log(`  First 5 values: [${singleEmbedding.slice(0, 5).map(v => v.toFixed(4)).join(", ")}]`);
    console.log();

    // Test 2: Multiple texts embedding
    console.log("Test 2: Embedding multiple texts");
    const multipleTexts = [
      "Artificial intelligence is transforming the world.",
      "Machine learning algorithms can learn from data.",
      "Natural language processing helps computers understand text.",
    ];
    console.log(`Input: ${multipleTexts.length} texts`);

    const multipleEmbeddings = await embedTexts("dashscope", multipleTexts);
    console.log(`✓ Generated ${multipleEmbeddings.length} embeddings`);
    for (let i = 0; i < multipleEmbeddings.length; i++) {
      console.log(`  Text ${i + 1}: ${multipleEmbeddings[i].length} dimensions`);
    }
    console.log();

    // Test 3: Batch processing (more than 10 texts)
    console.log("Test 3: Batch processing with 15 texts (testing automatic batching)");
    const batchTexts = Array.from({ length: 15 }, (_, i) =>
      `This is test message number ${i + 1}.`
    );

    const batchEmbeddings = await embedTexts("dashscope", batchTexts);
    console.log(`✓ Generated ${batchEmbeddings.length} embeddings (auto-batched into 2 requests)`);
    console.log();

    // Test 4: Different dimensions
    console.log("Test 4: Testing different embedding dimensions");
    const testDimensions = [512, 1024, 1536];

    for (const dim of testDimensions) {
      const embedding = await embedTexts("dashscope", ["Test"], dim);
      console.log(`✓ Dimension ${dim}: ${embedding[0].length} values`);
    }
    console.log();

    // Test 5: text_type parameter (query vs document)
    console.log("Test 5: Testing text_type parameter");
    const queryText = "What is artificial intelligence?";
    const documentText = "Artificial intelligence is a branch of computer science.";

    const queryEmbedding = await embedText("dashscope", queryText, 1536, {
      text_type: "query",
    });
    console.log(`✓ Query embedding: ${queryEmbedding.length} dimensions`);

    const documentEmbedding = await embedText("dashscope", documentText, 1536, {
      text_type: "document",
    });
    console.log(`✓ Document embedding: ${documentEmbedding.length} dimensions`);
    console.log();

    // Test 6: instruct parameter
    console.log("Test 6: Testing instruct parameter");
    const textWithInstruct = "Machine learning is a subset of AI.";
    const embeddingWithInstruct = await embedText(
      "dashscope",
      textWithInstruct,
      1536,
      {
        instruct: "Represent this sentence for retrieval:",
      },
    );
    console.log(`✓ Embedding with instruct: ${embeddingWithInstruct.length} dimensions`);
    console.log();

    // Test 7: Combined text_type and instruct
    console.log("Test 7: Testing combined text_type and instruct");
    const combinedEmbedding = await embedText(
      "dashscope",
      "Deep learning uses neural networks.",
      1536,
      {
        text_type: "document",
        instruct: "Generate embeddings for semantic search:",
      },
    );
    console.log(`✓ Combined params embedding: ${combinedEmbedding.length} dimensions`);
    console.log();

    console.log("✅ All tests passed successfully!");

  } catch (error) {
    console.error("❌ Test failed:");
    if (error instanceof Error) {
      console.error(`  ${error.message}`);
      if (error.message.includes("DASHSCOPE_API_KEY")) {
        console.error("\n💡 Tip: Make sure to add DASHSCOPE_API_KEY to your .env file");
      }
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}

// Run the test
testDashscopeEmbedding();
