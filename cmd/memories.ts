import { confirm } from "@inquirer/prompts";

import {
  extractErrorMessage,
  parseJSON,
  safeFetch,
  formatTimestamp,
} from "./lib.js";
import {
  isPromptAbortError,
  menuPrompt,
  type MenuResult,
  APP_BASE_URL,
  AUTH_BASE_URL,
} from "./core.js";

// Memory category type
type MemoryCategory =
  | "USER_INFO"
  | "USER_PREFERENCE"
  | "USER_GOAL"
  | "USER_RELATIONSHIP"
  | "EVENT"
  | "OTHER";

// Memory record type
export type MemoryRecord = {
  id: number;
  userId: string;
  content: string | null;
  prevContent: string | null;
  category: MemoryCategory | null;
  importance: number | null;
  confidence: number | null;
  action: string | null;
  createdAt: string;
  updatedAt: string;
};

type MemoryMenuResult =
  | { type: "exit" }
  | { type: "delete"; memory: MemoryRecord };

// ============================================================================
// Memory Management
// ============================================================================

async function browseMemories(token: string) {
  while (true) {
    const memories = await fetchMemories(token);
    if (memories.length === 0) {
      console.log("ℹ️  No memories found.");
      return;
    }

    const action = await memoryMenuPrompt(memories);

    if (action.type === "exit") {
      return;
    }

    if (action.type === "delete") {
      const memoryPreview =
        action.memory.content && action.memory.content.length > 50
          ? action.memory.content.substring(0, 50) + "..."
          : action.memory.content || "(empty)";

      const confirmed = await confirm({
        message: `Delete memory "${memoryPreview}"?`,
        default: false,
      });
      if (!confirmed) {
        continue;
      }

      const deleted = await deleteMemoryRequest(token, action.memory.id);
      if (deleted) {
        console.log(`✅ Deleted memory ${action.memory.id}.`);
      }
      continue;
    }
  }
}

async function fetchMemories(token: string): Promise<MemoryRecord[]> {
  const response = await safeFetch(
    "/api/mem",
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    "app",
    { auth: AUTH_BASE_URL, app: APP_BASE_URL },
  );

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    console.error(`❌ Failed to load memories: ${message}`);
    return [];
  }

  const data = await parseJSON<{ memories?: MemoryRecord[] }>(response);
  return Array.isArray(data?.memories) ? data.memories : [];
}

async function deleteMemoryRequest(token: string, memoryId: number) {
  const response = await safeFetch(
    `/api/mem/${memoryId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    "app",
    { auth: AUTH_BASE_URL, app: APP_BASE_URL },
  );

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    console.error(`❌ Failed to delete memory: ${message}`);
    return false;
  }

  return true;
}

async function memoryMenuPrompt(
  memories: MemoryRecord[],
): Promise<MemoryMenuResult> {
  if (memories.length === 0) {
    return { type: "exit" };
  }

  let menu: MenuResult<MemoryRecord>;
  try {
    menu = await menuPrompt<MemoryRecord>({
      message: "Memories",
      choices: memories.map((memory) => {
        const content = memory.content || "(empty)";
        const preview = content.length > 60 ? content.substring(0, 60) + "..." : content;
        const category = memory.category ? `[${memory.category}]` : "";
        const timestamp = formatTimestamp(memory.createdAt);

        return {
          name: `[${memory.id}] ${category} ${preview} - ${timestamp}`,
          value: memory,
        };
      }),
    });
  } catch (error) {
    if (isPromptAbortError(error)) {
      return { type: "exit" };
    }
    throw error;
  }

  if (menu.action === "cancel") {
    return { type: "exit" };
  }

  const selected = menu.item?.value ?? memories[0];
  if (!selected) {
    return { type: "exit" };
  }

  if (menu.action === "delete") {
    return { type: "delete", memory: selected };
  }

  // For "open" action, just show the memory details
  if (menu.action === "open") {
    printMemoryDetails(selected);
  }

  // Return to the menu after viewing details
  return { type: "exit" };
}

function printMemoryDetails(memory: MemoryRecord) {
  const created = formatTimestamp(memory.createdAt);
  const updated = formatTimestamp(memory.updatedAt);

  console.log("\n📝 Memory Details");
  console.log(`   ID: ${memory.id}`);
  console.log(`   Category: ${memory.category || "N/A"}`);
  console.log(`   Content: ${memory.content || "(empty)"}`);
  if (memory.prevContent) {
    console.log(`   Previous: ${memory.prevContent}`);
  }
  console.log(`   Action: ${memory.action || "N/A"}`);
  console.log(`   Importance: ${memory.importance !== null ? memory.importance : "N/A"}`);
  console.log(`   Confidence: ${memory.confidence !== null ? memory.confidence : "N/A"}`);
  console.log(`   Created: ${created}`);
  console.log(`   Updated: ${updated}`);
  console.log();
}

export { browseMemories };
