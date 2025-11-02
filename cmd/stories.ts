import { confirm, input, select } from "@inquirer/prompts";

import { extractErrorMessage, parseJSON, safeFetch } from "./http.js";
import { readSSE } from "./sse.js";
import { isPromptAbortError, menuPrompt, type MenuResult } from "./prompts.js";
import type { ProviderOption, StoryHandlerInfo, StoryRecord } from "./types.js";
import { formatTimestamp, requiredField } from "./utils.js";

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
  provider: ProviderOption;
  input: unknown;
};

const PROVIDERS: ProviderOption[] = ["ollama", "openai"];

async function browseStories(token: string) {
  while (true) {
    const stories = await fetchStories(token);
    if (stories.length === 0) {
      const wantsCreate = await confirm({
        message: "No stories found. Create one now?",
        default: true,
      });
      if (!wantsCreate) {
        console.log("ℹ️  No stories available.");
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
        console.log(`✅ Deleted story ${action.story.id}.`);
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
        console.log("ℹ️  Name unchanged.");
        continue;
      }

      const updated = await updateStoryRequest(token, action.story.id, trimmed);
      if (updated) {
        console.log(`✅ Story renamed to "${updated.name}".`);
      }
    }
  }
}

async function chatWithStory(token: string, storyRecord: StoryRecord) {
  const storyDetails = await fetchStoryDetails(token, storyRecord.id);
  if (!storyDetails) {
    return;
  }

  printStoryDetails(storyDetails);
  console.log(
    "\n💬 Entering chat mode. Commands: /handler to switch handlers, /provider to switch providers, /exit to go back.",
  );

  let handler = storyDetails.handler;
  if (!handler) {
    const available = await fetchHandlers(token, storyRecord.id);
    handler = available[0]?.name ?? "";
    if (!handler) {
      console.log("⚠️  No handler available. Returning to stories.");
      return;
    }
  }

  let provider = storyDetails.provider;
  if (!provider) {
    provider = PROVIDERS[0];
  }

  console.log(`⚙️  Using handler "${handler}" and provider "${provider}".`);

  while (true) {
    let rawMessage: string;
    try {
      rawMessage = await input({
        message: "You",
      });
    } catch (error) {
      if (isPromptAbortError(error)) {
        console.log("\n👋 Leaving chat.");
        return;
      }
      throw error;
    }

    const message = rawMessage.trim();
    if (!message) {
      console.log("⚠️  Message cannot be empty.");
      continue;
    }

    const command = message.toLowerCase();
    if (command === "/exit" || command === "/back" || command === "/quit") {
      console.log("👋 Leaving chat.");
      return;
    }

    if (command === "/handler") {
      const next = await selectStoryHandler(token, storyRecord.id, handler);
      if (next) {
        handler = next;
        console.log(`🔁 Using handler "${handler}".`);
      }
      continue;
    }

    if (command === "/provider") {
      const nextProvider = await selectProvider(provider);
      if (nextProvider) {
        provider = nextProvider;
        console.log(`🔁 Using provider "${provider}".`);
      }
      continue;
    }

    console.log(`\n🧑 You: ${message}`);
    await streamStoryConversation({
      token,
      storyId: storyRecord.id,
      handler,
      provider,
      input: message,
    });
  }
}

async function createStoryFlow(token: string) {
  const provider = await selectProvider();
  if (!provider) {
    console.log("⚠️  Story creation cancelled (provider not selected).");
    return;
  }

  const handler = await selectStoryHandler(token);
  if (!handler) {
    console.log("⚠️  Story creation cancelled (handler not selected).");
    return;
  }

  const name = await input({
    message: "New story name",
    validate: requiredField("Story name"),
  });

  const trimmed = name.trim();
  if (!trimmed) {
    console.log("⚠️  Story name cannot be empty.");
    return;
  }

  const created = await createStoryRequest(token, trimmed, provider, handler);
  if (created) {
    console.log(`✅ Created story "${created.name}" (id ${created.id}).`);
  }
}

async function selectStoryHandler(
  token: string,
  storyId?: number,
  current?: string,
) {
  const handlers = await fetchHandlers(token, storyId);
  if (handlers.length === 0) {
    console.log("⚠️  No story handlers are available.");
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

async function selectProvider(current?: ProviderOption) {
  const defaultIndex = Math.max(0, current ? PROVIDERS.indexOf(current) : 0);

  try {
    return await select<ProviderOption>({
      message: "Choose a provider",
      choices: PROVIDERS.map((provider) => ({
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
  provider,
  input: payload,
}: StreamArgs) {
  const response = await safeFetch(
    `/api/s/${storyId}/stream`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ handler, provider, input: payload }),
    },
    "app",
  );

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    console.error(`❌ Streaming failed: ${message}`);
    return;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/event-stream")) {
    if (contentType.includes("application/json")) {
      const body = await parseJSON<{ ok?: boolean; message?: string }>(
        response,
      );
      if (body?.ok) {
        console.log("ℹ️  Handler completed without streaming output.");
        return;
      }
      if (body?.message) {
        console.log(`ℹ️  ${body.message}`);
        return;
      }
    } else {
      const text = await response.text();
      if (text) {
        console.log(`ℹ️  ${text}`);
        return;
      }
    }
    console.log("ℹ️  Received response without stream content.");
    return;
  }

  console.log("\n🤖 Assistant:");
  let collected = "";
  let sawThinking = false;

  try {
    await readSSE(response, ({ event, data }) => {
      switch (event) {
        case "start": {
          console.log("…");
          break;
        }
        case "thinking": {
          sawThinking = true;
          console.log(`💭 ${data}`);
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
          console.log("✅ Finished.");
          break;
        }
        case "error": {
          if (collected && !collected.endsWith("\n")) {
            process.stdout.write("\n");
          }
          console.error(`❌ ${data}`);
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
      `❌ Streaming interrupted: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (!collected && !sawThinking) {
    console.log("(no assistant response)");
  }
}

async function fetchHandlers(
  token: string,
  storyId?: number,
): Promise<StoryHandlerInfo[]> {
  const endpoint =
    typeof storyId === "number" ? `/api/s/${storyId}/handlers` : "/api/s/handlers";

  const response = await safeFetch(
    endpoint,
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
    console.error(`❌ Failed to load handlers: ${message}`);
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

async function fetchStories(token: string): Promise<StoryRecord[]> {
  const response = await safeFetch(
    "/api/s",
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
    console.error(`❌ Failed to load stories: ${message}`);
    return [];
  }

  const data = await parseJSON<{ stories?: StoryRecord[] }>(response);
  return Array.isArray(data?.stories) ? data.stories : [];
}

async function fetchStoryDetails(token: string, storyId: number) {
  const response = await safeFetch(
    `/api/s/${storyId}`,
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
    console.error(`❌ Failed to load story: ${message}`);
    return null;
  }

  const data = await parseJSON<{ story?: StoryRecord }>(response);
  return data?.story ?? null;
}

async function deleteStoryRequest(token: string, storyId: number) {
  const response = await safeFetch(
    `/api/s/${storyId}`,
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
    console.error(`❌ Failed to delete story: ${message}`);
    return false;
  }

  return true;
}

async function updateStoryRequest(
  token: string,
  storyId: number,
  name: string,
) {
  const response = await safeFetch(
    `/api/s/${storyId}`,
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
    console.error(`❌ Failed to update story: ${message}`);
    return null;
  }

  const data = await parseJSON<{ story?: StoryRecord }>(response);
  return data?.story ?? null;
}

async function createStoryRequest(
  token: string,
  name: string,
  provider: ProviderOption,
  handler: string,
) {
  const response = await safeFetch(
    "/api/s",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, provider, handler }),
    },
    "app",
  );

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    console.error(`❌ Failed to create story: ${message}`);
    return null;
  }

  const data = await parseJSON<{ story?: StoryRecord }>(response);
  return data?.story ?? null;
}

function printStoryDetails(storyRecord: StoryRecord) {
  const created = formatTimestamp(storyRecord.createdAt);
  const updated = formatTimestamp(storyRecord.updatedAt);

  console.log("\n📘 Story Details");
  console.log(`   ID: ${storyRecord.id}`);
  console.log(`   Name: ${storyRecord.name}`);
  console.log(`   Owner: ${storyRecord.userId}`);
  console.log(`   Provider: ${storyRecord.provider}`);
  console.log(`   Handler: ${storyRecord.handler}`);
  console.log(`   Created: ${created}`);
  console.log(`   Updated: ${updated}`);
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
        name: `[${story.id}] ${story.name}`,
        value: story,
      })),
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

export { browseStories };
