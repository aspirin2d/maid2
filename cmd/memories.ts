import { confirm, input, select } from "@inquirer/prompts";

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
import type { MemoryCategory } from "../src/types.js";
import { MEMORY_CATEGORIES } from "../src/types.js";

// Helper function to format category names for display
function formatCategoryName(category: MemoryCategory): string {
  return category
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

// Generate category choices from centralized constant
const CATEGORY_CHOICES = [
  { name: "None", value: null as MemoryCategory | null },
  ...MEMORY_CATEGORIES.map((cat) => ({
    name: formatCategoryName(cat),
    value: cat as MemoryCategory,
  })),
];

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
  | { type: "create" }
  | { type: "edit"; memory: MemoryRecord }
  | { type: "delete"; memory: MemoryRecord };

// ============================================================================
// Memory Management
// ============================================================================

async function browseMemories(token: string) {
  while (true) {
    const memories = await fetchMemories(token);
    if (memories.length === 0) {
      console.log("ℹ️  No memories found.");

      // Prompt to create the first memory
      const shouldCreate = await confirm({
        message: "Would you like to create a memory?",
        default: true,
      });

      if (shouldCreate) {
        const created = await promptAndCreateMemory(token);
        if (created) {
          console.log(`✅ Created memory ${created.id}.`);
        }
      }

      if (memories.length === 0 && !shouldCreate) {
        return;
      }
      continue;
    }

    const action = await memoryMenuPrompt(memories);

    if (action.type === "exit") {
      return;
    }

    if (action.type === "create") {
      const created = await promptAndCreateMemory(token);
      if (created) {
        console.log(`✅ Created memory ${created.id}.`);
      }
      continue;
    }

    if (action.type === "edit") {
      const updated = await promptAndEditMemory(token, action.memory);
      if (updated) {
        console.log(`✅ Updated memory ${updated.id}.`);
      }
      continue;
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

async function promptAndCreateMemory(
  token: string,
): Promise<MemoryRecord | null> {
  try {
    const content = await input({
      message: "Enter memory content:",
      validate: (value: string) => {
        if (!value.trim()) {
          return "Content cannot be empty";
        }
        return true;
      },
    });

    const categoryChoice = await select<MemoryCategory | null>({
      message: "Select category (optional):",
      choices: CATEGORY_CHOICES,
      default: null,
    });

    const memory = await createMemoryRequest(token, {
      content,
      category: categoryChoice,
    });

    return memory;
  } catch (error) {
    if (isPromptAbortError(error)) {
      return null;
    }
    throw error;
  }
}

async function promptAndEditMemory(
  token: string,
  memory: MemoryRecord,
): Promise<MemoryRecord | null> {
  try {
    console.log(`\nEditing memory ${memory.id}:`);
    console.log(`Current content: ${memory.content || "(empty)"}`);

    const content = await input({
      message: "Enter new content (leave empty to keep current):",
      default: memory.content || "",
    });

    const categoryChoice = await select<MemoryCategory | null>({
      message: "Select category (optional):",
      choices: CATEGORY_CHOICES,
      default: memory.category,
    });

    // Only send updates if values changed
    const updates: any = {};
    if (content.trim() && content !== memory.content) {
      updates.content = content.trim();
    }
    if (categoryChoice !== memory.category) {
      updates.category = categoryChoice;
    }

    // If nothing changed, return the original memory
    if (Object.keys(updates).length === 0) {
      console.log("ℹ️  No changes made.");
      return memory;
    }

    const updated = await updateMemoryRequest(token, memory.id, updates);
    return updated;
  } catch (error) {
    if (isPromptAbortError(error)) {
      return null;
    }
    throw error;
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

async function createMemoryRequest(
  token: string,
  data: {
    content: string;
    category?: MemoryCategory | null;
    importance?: number | null;
    confidence?: number | null;
  },
): Promise<MemoryRecord | null> {
  const response = await safeFetch(
    "/api/mem",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: data.content,
        category: data.category ?? undefined,
        importance: data.importance ?? undefined,
        confidence: data.confidence ?? undefined,
      }),
    },
    "app",
    { auth: AUTH_BASE_URL, app: APP_BASE_URL },
  );

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    console.error(`❌ Failed to create memory: ${message}`);
    return null;
  }

  const result = await parseJSON<{ memory?: MemoryRecord }>(response);
  return result?.memory ?? null;
}

async function updateMemoryRequest(
  token: string,
  memoryId: number,
  data: {
    content?: string;
    category?: MemoryCategory | null;
    importance?: number | null;
    confidence?: number | null;
  },
): Promise<MemoryRecord | null> {
  const response = await safeFetch(
    `/api/mem/${memoryId}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: data.content ?? undefined,
        category: data.category ?? undefined,
        importance: data.importance ?? undefined,
        confidence: data.confidence ?? undefined,
      }),
    },
    "app",
    { auth: AUTH_BASE_URL, app: APP_BASE_URL },
  );

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    console.error(`❌ Failed to update memory: ${message}`);
    return null;
  }

  const result = await parseJSON<{ memory?: MemoryRecord }>(response);
  return result?.memory ?? null;
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

  if (menu.action === "create") {
    return { type: "create" };
  }

  if (menu.action === "edit") {
    return { type: "edit", memory: selected };
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
