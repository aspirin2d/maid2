import { confirm, input } from "@inquirer/prompts";

import { extractErrorMessage, parseJSON, safeFetch } from "./http.js";
import { isPromptAbortError, menuPrompt, type MenuResult } from "./prompts.js";
import { chatWithStory, selectProvider, selectStoryHandler } from "./story-chat.js";
import type { ProviderOption, StoryRecord } from "./types.js";
import { requiredField } from "./utils.js";

type StoryMenuResult =
  | { type: "exit" }
  | { type: "chat"; story: StoryRecord }
  | { type: "delete"; story: StoryRecord }
  | { type: "edit"; story: StoryRecord }
  | { type: "create" };

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
