import { confirm, input, select } from "@inquirer/prompts";

import {
  extractErrorMessage,
  parseJSON,
  readSSE,
  formatTimestamp,
  requiredField,
} from "./lib.js";
import {
  isPromptAbortError,
  menuPrompt,
  type MenuResult,
  type StoryRecord,
  type StoryHandlerInfo,
} from "./core.js";
import { buildHandlerInput, formatHandlerOutput } from "./handlers.js";
import { apiFetch } from "./api.js";
import {
  EMBEDDING_PROVIDERS,
  LLM_PROVIDERS,
  type EmbeddingProviderOption,
  type LlmProviderOption,
} from "./constants.js";

type StoryMenuResult =
  | { type: "exit" }
  | { type: "chat"; story: StoryRecord }
  | { type: "delete"; story: StoryRecord }
  | { type: "edit"; story: StoryRecord }
  | { type: "create" };

type StreamArgs = {
  token: string;
  storyId: number;
  handler: string;
  embeddingProvider: EmbeddingProviderOption;
  llmProvider: LlmProviderOption;
  input: unknown;
};

// ============================================================================
// Story Management
// ============================================================================

async function browseStories(token: string) {
  while (true) {
    const stories = await fetchStories(token);
    if (stories.length === 0) {
      const wantsCreate = await confirm({
        message: "No stories found. Create one now?",
        default: true,
      });
      if (!wantsCreate) {
        console.log("No stories available.");
        return;
      }
      await createStoryFlow(token);
      continue;
    }

    const action = await storyMenuPrompt(stories);

    if (action.type === "exit") {
      return;
    }

    if (action.type === "chat") {
      await chatWithStory(token, action.story);
      continue;
    }

    if (action.type === "create") {
      await createStoryFlow(token);
      continue;
    }

    if (action.type === "delete") {
      const confirmed = await confirm({
        message: `Delete "${action.story.name}"?`,
        default: false,
      });
      if (!confirmed) {
        continue;
      }

      const deleted = await deleteStoryRequest(token, action.story.id);
      if (deleted) {
        console.log(`Deleted story ${action.story.id}.`);
      }
      continue;
    }

    if (action.type === "edit") {
      const currentName = action.story.name;
      const newName = await input({
        message: "New story name",
        default: currentName,
        validate: requiredField("Story name"),
      });

      const trimmed = newName.trim();
      if (trimmed === currentName) {
        console.log("Name unchanged.");
        continue;
      }

      const updated = await updateStoryRequest(token, action.story.id, trimmed);
      if (updated) {
        console.log(`Story renamed to "${updated.name}".`);
      }
    }
  }
}

async function createStoryFlow(token: string) {
  const embeddingProvider = await selectEmbeddingProvider();
  if (!embeddingProvider) {
    console.log("Story creation cancelled (embedding provider not selected).");
    return;
  }

  const llmProvider = await selectLlmProvider();
  if (!llmProvider) {
    console.log("Story creation cancelled (LLM provider not selected).");
    return;
  }

  const handler = await selectStoryHandler(token);
  if (!handler) {
    console.log("Story creation cancelled (handler not selected).");
    return;
  }

  const name = await input({
    message: "New story name",
    validate: requiredField("Story name"),
  });

  const trimmed = name.trim();
  if (!trimmed) {
    console.log("Story name cannot be empty.");
    return;
  }

  const created = await createStoryRequest(
    token,
    trimmed,
    embeddingProvider,
    llmProvider,
    handler,
  );
  if (created) {
    console.log(`Created story "${created.name}" (id ${created.id}).`);
  }
}

async function fetchStories(token: string): Promise<StoryRecord[]> {
  const response = await apiFetch(
    "/api/v1/stories",
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    "app",
  );

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    console.error(`Failed to load stories: ${message}`);
    return [];
  }

  const data = await parseJSON<{ stories?: StoryRecord[] }>(response);
  return Array.isArray(data?.stories) ? data.stories : [];
}

async function deleteStoryRequest(token: string, storyId: number) {
  const response = await apiFetch(
    `/api/v1/stories/${storyId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    "app",
  );

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    console.error(`Failed to delete story: ${message}`);
    return false;
  }

  return true;
}

async function clearStoryMessagesRequest(token: string, storyId: number) {
  const response = await apiFetch(
    `/api/v1/stories/${storyId}/messages`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    "app",
  );

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    console.error(`Failed to clear messages: ${message}`);
    return null;
  }

  const data = await parseJSON<{ deletedCount?: number }>(response);
  return data?.deletedCount ?? 0;
}

async function updateStoryRequest(
  token: string,
  storyId: number,
  name: string,
) {
  const response = await apiFetch(
    `/api/v1/stories/${storyId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name }),
    },
    "app",
  );

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    console.error(`Failed to update story: ${message}`);
    return null;
  }

  const data = await parseJSON<{ story?: StoryRecord }>(response);
  return data?.story ?? null;
}

async function createStoryRequest(
  token: string,
  name: string,
  embeddingProvider: EmbeddingProviderOption,
  llmProvider: LlmProviderOption,
  handler: string,
) {
  const response = await apiFetch(
    "/api/v1/stories",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, embeddingProvider, llmProvider, handler }),
    },
    "app",
  );

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    console.error(`Failed to create story: ${message}`);
    return null;
  }

  const data = await parseJSON<{ story?: StoryRecord }>(response);
  return data?.story ?? null;
}

async function storyMenuPrompt(
  stories: StoryRecord[],
): Promise<StoryMenuResult> {
  if (stories.length === 0) {
    return { type: "exit" };
  }

  let menu: MenuResult<StoryRecord>;
  try {
    menu = await menuPrompt<StoryRecord>({
      message: "Stories",
      choices: stories.map((story) => ({
        name: `${story.name} (id: ${story.id})`,
        value: story,
      })),
      disabledActions: ["extract"],
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

  if (menu.action === "create") {
    return { type: "create" };
  }

  const selected = menu.item?.value ?? stories[0];
  if (!selected) {
    return { type: "exit" };
  }

  if (menu.action === "delete") {
    return { type: "delete", story: selected };
  }

  if (menu.action === "edit") {
    return { type: "edit", story: selected };
  }

  return { type: "chat", story: selected };
}

// ============================================================================
// Story Chat
// ============================================================================

async function chatWithStory(token: string, storyRecord: StoryRecord) {
  const storyDetails = await fetchStoryDetails(token, storyRecord.id);
  if (!storyDetails) {
    return;
  }

  printStoryDetails(storyDetails);
  console.log(
    "\nEntering chat mode. Commands: /handler to switch handlers, /embedding to switch embedding providers, /llm to switch LLM providers, /clear to clear all messages, /exit to go back.",
  );

  let handler = storyDetails.handler;
  if (!handler) {
    const available = await fetchHandlers(token, storyRecord.id);
    handler = available[0]?.name ?? "";
    if (!handler) {
      console.log("No handler available. Returning to stories.");
      return;
    }
  }

  const initialEmbeddingProvider =
    typeof storyDetails.embeddingProvider === "string" &&
    EMBEDDING_PROVIDERS.includes(
      storyDetails.embeddingProvider as EmbeddingProviderOption,
    )
      ? (storyDetails.embeddingProvider as EmbeddingProviderOption)
      : EMBEDDING_PROVIDERS[0];

  const initialLlmProvider =
    typeof storyDetails.llmProvider === "string" &&
    LLM_PROVIDERS.includes(storyDetails.llmProvider as LlmProviderOption)
      ? (storyDetails.llmProvider as LlmProviderOption)
      : LLM_PROVIDERS[0];

  let embeddingProvider: EmbeddingProviderOption = initialEmbeddingProvider;
  let llmProvider: LlmProviderOption = initialLlmProvider;

  console.log(
    `Using handler "${handler}", embedding provider "${embeddingProvider}", and LLM provider "${llmProvider}".`,
  );

  while (true) {
    // Build handler-specific input (uses handler registry)
    let userInput: unknown;
    try {
      userInput = await buildHandlerInput(handler);
    } catch (error) {
      if (isPromptAbortError(error)) {
        console.log("\nLeaving chat.");
        return;
      }
      throw error;
    }

    // Handle string commands
    if (typeof userInput === "string") {
      if (!userInput) {
        console.log("Message cannot be empty.");
        continue;
      }

      const command = userInput.toLowerCase();
      if (command === "/exit" || command === "/back" || command === "/quit") {
        console.log("Leaving chat.");
        return;
      }

      if (command === "/clear") {
        try {
          const confirmed = await confirm({
            message:
              "Are you sure you want to clear all messages from this story?",
            default: false,
          });

          if (confirmed) {
            const deletedCount = await clearStoryMessagesRequest(
              token,
              storyRecord.id,
            );
            if (deletedCount !== null) {
              console.log(
                `Cleared ${deletedCount} message(s) from this story.`,
              );
            }
          } else {
            console.log("Clear cancelled.");
          }
        } catch (error) {
          if (isPromptAbortError(error)) {
            console.log("Clear cancelled.");
          } else {
            throw error;
          }
        }
        continue;
      }

      if (command === "/handler") {
        const next = await selectStoryHandler(token, storyRecord.id, handler);
        if (next) {
          handler = next;
          console.log(`Using handler "${handler}".`);
        }
        continue;
      }

      if (command === "/embedding") {
        const nextProvider = await selectEmbeddingProvider(embeddingProvider);
        if (nextProvider) {
          embeddingProvider = nextProvider;
          console.log(`Using embedding provider "${embeddingProvider}".`);
        }
        continue;
      }

      if (command === "/llm") {
        const nextProvider = await selectLlmProvider(llmProvider);
        if (nextProvider) {
          llmProvider = nextProvider;
          console.log(`Using LLM provider "${llmProvider}".`);
        }
        continue;
      }
    }

    // Display user input
    const displayMessage =
      typeof userInput === "string"
        ? userInput
        : JSON.stringify(userInput, null, 2);
    console.log(`\nYou: ${displayMessage}`);

    // Stream the conversation
    await streamStoryConversation({
      token,
      storyId: storyRecord.id,
      handler,
      embeddingProvider,
      llmProvider,
      input: userInput,
    });
  }
}

async function selectStoryHandler(
  token: string,
  storyId?: number,
  current?: string,
) {
  const handlers = await fetchHandlers(token, storyId);
  if (handlers.length === 0) {
    console.log("No story handlers are available.");
    return null;
  }

  const defaultIndex = Math.max(
    0,
    handlers.findIndex((handler) => handler.name === current),
  );

  try {
    return await select({
      message: "Choose a handler",
      choices: handlers.map((handler) => ({
        name: handler.name,
        value: handler.name,
      })),
      default: defaultIndex,
    });
  } catch (error) {
    if (isPromptAbortError(error)) {
      return null;
    }
    throw error;
  }
}

async function selectEmbeddingProvider(
  current?: EmbeddingProviderOption | string | null,
) {
  const normalized =
    typeof current === "string" &&
    EMBEDDING_PROVIDERS.includes(current as EmbeddingProviderOption)
      ? (current as EmbeddingProviderOption)
      : undefined;

  const defaultIndex = Math.max(
    0,
    normalized ? EMBEDDING_PROVIDERS.indexOf(normalized) : 0,
  );

  try {
    return await select<EmbeddingProviderOption>({
      message: "Choose an embedding provider",
      choices: EMBEDDING_PROVIDERS.map((provider) => ({
        name: provider,
        value: provider,
      })),
      default: defaultIndex === -1 ? 0 : defaultIndex,
    });
  } catch (error) {
    if (isPromptAbortError(error)) {
      return null;
    }
    throw error;
  }
}

async function selectLlmProvider(
  current?: LlmProviderOption | string | null,
) {
  const normalized =
    typeof current === "string" &&
    LLM_PROVIDERS.includes(current as LlmProviderOption)
      ? (current as LlmProviderOption)
      : undefined;

  const defaultIndex = Math.max(
    0,
    normalized ? LLM_PROVIDERS.indexOf(normalized) : 0,
  );

  try {
    return await select<LlmProviderOption>({
      message: "Choose an LLM provider",
      choices: LLM_PROVIDERS.map((provider) => ({
        name: provider,
        value: provider,
      })),
      default: defaultIndex === -1 ? 0 : defaultIndex,
    });
  } catch (error) {
    if (isPromptAbortError(error)) {
      return null;
    }
    throw error;
  }
}

async function streamStoryConversation({
  token,
  storyId,
  handler,
  embeddingProvider,
  llmProvider,
  input: payload,
}: StreamArgs) {
  const response = await apiFetch(
    `/api/v1/stories/${storyId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        handler,
        embeddingProvider,
        llmProvider,
        input: payload,
      }),
    },
    "app",
  );

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    console.error(`Streaming failed: ${message}`);
    return;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/event-stream")) {
    if (contentType.includes("application/json")) {
      const body = await parseJSON<{ ok?: boolean; message?: string }>(
        response,
      );
      if (body?.ok) {
        console.log("Handler completed without streaming output.");
        return;
      }
      if (body?.message) {
        console.log(body.message);
        return;
      }
    } else {
      const text = await response.text();
      if (text) {
        console.log(text);
        return;
      }
    }
    console.log("Received response without stream content.");
    return;
  }

  console.log("\nAssistant:");
  let collected = "";
  let sawThinking = false;
  let sawError = false;
  let interrupted = false;

  try {
    await readSSE(response, ({ event, data }) => {
      switch (event) {
        case "start": {
          console.log("…");
          break;
        }
        case "thinking": {
          sawThinking = true;
          console.log(`Thinking: ${data}`);
          break;
        }
        case "delta": {
          collected += data;
          process.stdout.write(data);
          break;
        }
        case "finish": {
          if (collected && !collected.endsWith("\n")) {
            process.stdout.write("\n");
          }
          console.log("Finished.");
          break;
        }
        case "error": {
          if (collected && !collected.endsWith("\n")) {
            process.stdout.write("\n");
          }
          console.error(data);
          sawError = true;
          break;
        }
        default: {
          if (data) {
            console.log(`${event}: ${data}`);
          }
        }
      }
    });
  } catch (error) {
    if (collected && !collected.endsWith("\n")) {
      process.stdout.write("\n");
    }
    console.error(
      `Streaming interrupted: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    interrupted = true;
  }

  if (!collected && !sawThinking) {
    console.log("(no assistant response)");
    return;
  }

  if (!sawError && !interrupted && collected.trim()) {
    displayParsedResponse(handler, collected);
  } else if (collected.trim()) {
    // Still show raw data even if parsing is skipped due to errors.
    displayRawResponse(collected);
  }
}

async function fetchHandlers(
  token: string,
  storyId?: number,
): Promise<StoryHandlerInfo[]> {
  const response = await apiFetch(
    "/api/v1/handlers",
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    "app",
  );

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    console.error(`Failed to load handlers: ${message}`);
    return [];
  }

  const data = await parseJSON<{ handlers?: StoryHandlerInfo[] }>(response);
  if (!Array.isArray(data?.handlers)) {
    return [];
  }

  return data.handlers.filter(
    (item): item is StoryHandlerInfo => typeof item?.name === "string",
  );
}

async function fetchStoryDetails(token: string, storyId: number) {
  const response = await apiFetch(
    `/api/v1/stories/${storyId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    "app",
  );

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    console.error(`Failed to load story: ${message}`);
    return null;
  }

  const data = await parseJSON<{ story?: StoryRecord }>(response);
  return data?.story ?? null;
}

function printStoryDetails(storyRecord: StoryRecord) {
  const created = formatTimestamp(storyRecord.createdAt);
  const updated = formatTimestamp(storyRecord.updatedAt);

  console.log("\nStory Details");
  console.log(`   ID: ${storyRecord.id}`);
  console.log(`   Name: ${storyRecord.name}`);
  console.log(`   Owner: ${storyRecord.userId}`);
  console.log(`   Embedding Provider: ${storyRecord.embeddingProvider}`);
  console.log(`   LLM Provider: ${storyRecord.llmProvider}`);
  console.log(`   Handler: ${storyRecord.handler}`);
  console.log(`   Created: ${created}`);
  console.log(`   Updated: ${updated}`);
}

function displayParsedResponse(handler: string, payload: string) {
  const raw = payload.trim();
  if (!raw) return;

  // Try handler-specific formatting first
  const handled = formatHandlerOutput(handler, payload);
  if (handled) {
    return;
  }

  // Fallback: try to parse as JSON and display prettily
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }

  displayRawResponse(parsed ? JSON.stringify(parsed, null, 2) : raw);
}

function displayRawResponse(content: string) {
  if (!content.trim()) return;
  console.log("\nRaw response:");
  console.log(content);
}

// ============================================================================
// Direct Story Commands (used by CLI subcommands)
// ============================================================================

async function resolveStoryFromArgs(
  token: string,
  storyIdArg?: string,
  promptMessage = "Select a story",
): Promise<StoryRecord | null> {
  if (storyIdArg) {
    const id = Number.parseInt(storyIdArg, 10);
    if (Number.isNaN(id)) {
      console.log(`Story id must be a number (received "${storyIdArg}").`);
      return null;
    }

    const story = await fetchStoryDetails(token, id);
    if (!story) {
      console.log(`Story ${id} was not found.`);
      return null;
    }
    return story;
  }

  return selectStoryInteractively(token, promptMessage);
}

async function selectStoryInteractively(
  token: string,
  message: string,
): Promise<StoryRecord | null> {
  const stories = await fetchStories(token);
  if (stories.length === 0) {
    console.log("No stories found.");
    return null;
  }

  try {
    return await select<StoryRecord>({
      message,
      choices: stories.map((story) => ({
        name: `${story.name} (id: ${story.id})`,
        value: story,
      })),
    });
  } catch (error) {
    if (isPromptAbortError(error)) {
      console.log("Selection cancelled.");
      return null;
    }
    throw error;
  }
}

async function listStoriesCommand(token: string) {
  const stories = await fetchStories(token);
  if (stories.length === 0) {
    console.log("No stories found.");
    return;
  }

  console.log(`\nStories (${stories.length}):`);
  for (const story of stories) {
    const updated = formatTimestamp(story.updatedAt);
    console.log(
      `  [${story.id}] ${story.name} — embedding: ${story.embeddingProvider}, llm: ${story.llmProvider}, handler: ${story.handler} (updated ${updated})`,
    );
  }
}

async function createStoryCommand(token: string) {
  await createStoryFlow(token);
}

async function renameStoryCommand(token: string, args: string[]) {
  const [storyIdArg, ...nameParts] = args;
  const story = await resolveStoryFromArgs(
    token,
    storyIdArg,
    "Select a story to rename",
  );
  if (!story) {
    return;
  }

  let desiredName = nameParts.join(" ").trim();
  if (!desiredName) {
    desiredName = await input({
      message: "New story name",
      default: story.name,
      validate: requiredField("Story name"),
    });
  }

  const trimmed = desiredName.trim();
  if (!trimmed) {
    console.log("Story name cannot be empty.");
    return;
  }
  if (trimmed === story.name) {
    console.log("Name unchanged.");
    return;
  }

  const updated = await updateStoryRequest(token, story.id, trimmed);
  if (updated) {
    console.log(`Story renamed to "${updated.name}".`);
  }
}

async function deleteStoryCommand(token: string, args: string[]) {
  const [storyIdArg] = args;
  const story = await resolveStoryFromArgs(
    token,
    storyIdArg,
    "Select a story to delete",
  );
  if (!story) {
    return;
  }

  let confirmed = false;
  try {
    confirmed = await confirm({
      message: `Delete "${story.name}"?`,
      default: false,
    });
  } catch (error) {
    if (isPromptAbortError(error)) {
      console.log("Deletion cancelled.");
      return;
    }
    throw error;
  }

  if (!confirmed) {
    console.log("Deletion cancelled.");
    return;
  }

  const deleted = await deleteStoryRequest(token, story.id);
  if (deleted) {
    console.log(`Deleted story ${story.id}.`);
  }
}

async function chatStoryCommand(token: string, args: string[]) {
  const [storyIdArg] = args;
  const story = await resolveStoryFromArgs(
    token,
    storyIdArg,
    "Select a story to chat with",
  );
  if (!story) {
    return;
  }
  await chatWithStory(token, story);
}

async function clearStoryMessagesCommand(token: string, args: string[]) {
  const [storyIdArg] = args;
  const story = await resolveStoryFromArgs(
    token,
    storyIdArg,
    "Select a story to clear messages from",
  );
  if (!story) {
    return;
  }

  let confirmed = false;
  try {
    confirmed = await confirm({
      message: `Clear all messages for "${story.name}"?`,
      default: false,
    });
  } catch (error) {
    if (isPromptAbortError(error)) {
      console.log("Clear cancelled.");
      return;
    }
    throw error;
  }

  if (!confirmed) {
    console.log("Clear cancelled.");
    return;
  }

  const deletedCount = await clearStoryMessagesRequest(token, story.id);
  if (deletedCount !== null) {
    console.log(`Cleared ${deletedCount} message(s) from ${story.name}.`);
  }
}

async function listStoryHandlersCommand(token: string, args: string[]) {
  const [storyIdArg] = args;
  let contextStory: StoryRecord | null = null;
  if (storyIdArg) {
    contextStory = await resolveStoryFromArgs(token, storyIdArg);
    if (!contextStory) {
      return;
    }
  }

  const handlers = await fetchHandlers(token, contextStory?.id);
  if (handlers.length === 0) {
    console.log("No story handlers are available.");
    return;
  }

  if (contextStory) {
    console.log(
      `Handlers for story ${contextStory.id} (${contextStory.name}):`,
    );
  } else {
    console.log("Available story handlers:");
  }

  for (const handler of handlers) {
    console.log(`  - ${handler.name}`);
  }
}

export {
  browseStories,
  chatWithStory,
  fetchHandlers,
  fetchStoryDetails,
  printStoryDetails,
  selectEmbeddingProvider,
  selectLlmProvider,
  selectStoryHandler,
  clearStoryMessagesCommand,
  createStoryCommand,
  deleteStoryCommand,
  listStoryHandlersCommand,
  listStoriesCommand,
  renameStoryCommand,
  chatStoryCommand,
};
