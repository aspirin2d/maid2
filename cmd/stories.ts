import { confirm, input, select, number } from "@inquirer/prompts";

import {
  extractErrorMessage,
  parseJSON,
  safeFetch,
  readSSE,
  formatTimestamp,
  requiredField,
} from "./lib.js";
import {
  isPromptAbortError,
  menuPrompt,
  type MenuResult,
  type ProviderOption,
  type StoryRecord,
  type StoryHandlerInfo,
  APP_BASE_URL,
  AUTH_BASE_URL,
} from "./core.js";

const PROVIDERS: ProviderOption[] = ["ollama", "openai"];

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

// ============================================================================
// Live Handler Event Input Builder
// ============================================================================

/**
 * Build event-based input for the live handler
 * Provides an interactive menu to create various event types
 */
async function buildLiveEventInput(): Promise<unknown> {
  const eventType = await select({
    message: "Choose event type",
    choices: [
      { name: "💬 Simple text (just type a message)", value: "simple_text" },
      { name: "👤 User chat (regular conversation)", value: "user_chat" },
      { name: "🎯 Bullet chat (danmaku/弹幕)", value: "bullet_chat" },
      { name: "📺 Program event (start/finish segment)", value: "program_event" },
      { name: "🎁 Gift event (donations/gifts)", value: "gift_event" },
      { name: "❤️ User interaction (follow/subscribe)", value: "user_interaction" },
      { name: "⚙️ System event (technical notification)", value: "system_event" },
      { name: "😊 Emotion event (mood change)", value: "emotion_event" },
    ],
    default: "simple_text",
  });

  // Simple text - just return the text directly (backward compatible)
  if (eventType === "simple_text") {
    const text = await input({
      message: "Enter your message",
      validate: requiredField("Message"),
    });
    return text;
  }

  // Build event-specific data
  switch (eventType) {
    case "user_chat": {
      const message = await input({
        message: "Chat message",
        validate: requiredField("Message"),
      });
      const username = await input({
        message: "Username (optional, press Enter to skip)",
      });
      return {
        type: "user_chat",
        data: {
          message,
          ...(username.trim() && { username: username.trim() }),
          timestamp: Date.now(),
        },
      };
    }

    case "bullet_chat": {
      const message = await input({
        message: "Bullet chat message",
        validate: requiredField("Message"),
      });
      const username = await input({
        message: "Username (optional, press Enter to skip)",
      });
      const position = await select({
        message: "Display position",
        choices: [
          { name: "Scroll", value: "scroll" },
          { name: "Top", value: "top" },
          { name: "Bottom", value: "bottom" },
        ],
        default: "scroll",
      });
      return {
        type: "bullet_chat",
        data: {
          message,
          ...(username.trim() && { username: username.trim() }),
          position,
          timestamp: Date.now(),
        },
      };
    }

    case "program_event": {
      const action = await select({
        message: "Program action",
        choices: [
          { name: "Start", value: "start" },
          { name: "Finish", value: "finish" },
          { name: "Pause", value: "pause" },
          { name: "Resume", value: "resume" },
        ],
      });
      const programName = await input({
        message: "Program name",
        validate: requiredField("Program name"),
      });
      const programType = await select({
        message: "Program type (optional)",
        choices: [
          { name: "Skip", value: "" },
          { name: "Singing (唱歌)", value: "singing" },
          { name: "Chatting (聊天)", value: "chatting" },
          { name: "Gaming (游戏)", value: "gaming" },
          { name: "Drawing (绘画)", value: "drawing" },
          { name: "Other (其他)", value: "other" },
        ],
      });
      const data: any = {
        action,
        programName,
        ...(programType && { programType }),
      };

      if (action === "finish") {
        const durationInput = await input({
          message: "Duration in seconds (optional, press Enter to skip)",
        });
        if (durationInput.trim()) {
          const duration = parseInt(durationInput, 10);
          if (!isNaN(duration)) {
            data.duration = duration;
          }
        }
      }

      return {
        type: "program_event",
        data,
      };
    }

    case "gift_event": {
      const username = await input({
        message: "Sender username",
        validate: requiredField("Username"),
      });
      const giftName = await input({
        message: "Gift name",
        validate: requiredField("Gift name"),
      });
      const giftCountInput = await input({
        message: "Gift count",
        default: "1",
        validate: (value) => {
          const num = parseInt(value, 10);
          if (isNaN(num) || num < 1) {
            return "Please enter a valid number (minimum 1)";
          }
          return true;
        },
      });
      const giftMessage = await input({
        message: "Message with gift (optional, press Enter to skip)",
      });
      const giftValueInput = await input({
        message: "Gift value (optional, press Enter to skip)",
      });

      const data: any = {
        username,
        giftName,
        giftCount: parseInt(giftCountInput, 10),
        ...(giftMessage.trim() && { message: giftMessage.trim() }),
      };

      if (giftValueInput.trim()) {
        const value = parseFloat(giftValueInput);
        if (!isNaN(value)) {
          data.giftValue = value;
        }
      }

      return {
        type: "gift_event",
        data,
      };
    }

    case "user_interaction": {
      const action = await select({
        message: "Interaction type",
        choices: [
          { name: "Follow (关注)", value: "follow" },
          { name: "Subscribe (订阅)", value: "subscribe" },
          { name: "Like (点赞)", value: "like" },
          { name: "Share (分享)", value: "share" },
        ],
      });
      const username = await input({
        message: "Username",
        validate: requiredField("Username"),
      });
      const data: any = {
        action,
        username,
      };

      if (action === "subscribe") {
        const tier = await input({
          message: "Subscription tier (optional, press Enter to skip)",
        });
        const monthsInput = await input({
          message: "Subscription months (optional, press Enter to skip)",
        });

        if (tier.trim()) {
          data.tier = tier.trim();
        }
        if (monthsInput.trim()) {
          const months = parseInt(monthsInput, 10);
          if (!isNaN(months)) {
            data.months = months;
          }
        }
      }

      return {
        type: "user_interaction",
        data,
      };
    }

    case "system_event": {
      const eventTypeStr = await input({
        message: "Event type (e.g., stream_start, technical_issue)",
        validate: requiredField("Event type"),
      });
      const message = await input({
        message: "System message (optional, press Enter to skip)",
      });
      const severity = await select({
        message: "Severity",
        choices: [
          { name: "Info", value: "info" },
          { name: "Warning", value: "warning" },
          { name: "Error", value: "error" },
        ],
        default: "info",
      });
      return {
        type: "system_event",
        data: {
          eventType: eventTypeStr,
          ...(message.trim() && { message: message.trim() }),
          severity,
        },
      };
    }

    case "emotion_event": {
      const emotion = await input({
        message: "Emotion (e.g., happy, excited, tired, surprised)",
        validate: requiredField("Emotion"),
      });
      const intensityInput = await input({
        message: "Intensity 0-1 (optional, press Enter to skip)",
      });
      const trigger = await input({
        message: "Trigger/reason (optional, press Enter to skip)",
      });
      const durationInput = await input({
        message: "Duration in seconds (optional, press Enter to skip)",
      });

      const data: any = {
        emotion,
      };

      if (intensityInput.trim()) {
        const intensity = parseFloat(intensityInput);
        if (!isNaN(intensity) && intensity >= 0 && intensity <= 1) {
          data.intensity = intensity;
        }
      }
      if (trigger.trim()) {
        data.trigger = trigger.trim();
      }
      if (durationInput.trim()) {
        const duration = parseInt(durationInput, 10);
        if (!isNaN(duration)) {
          data.duration = duration;
        }
      }

      return {
        type: "emotion_event",
        data,
      };
    }

    default:
      // Fallback to simple text
      const text = await input({
        message: "Enter your message",
        validate: requiredField("Message"),
      });
      return text;
  }
}

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
    { auth: AUTH_BASE_URL, app: APP_BASE_URL },
  );

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    console.error(`❌ Failed to load stories: ${message}`);
    return [];
  }

  const data = await parseJSON<{ stories?: StoryRecord[] }>(response);
  return Array.isArray(data?.stories) ? data.stories : [];
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
    { auth: AUTH_BASE_URL, app: APP_BASE_URL },
  );

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    console.error(`❌ Failed to delete story: ${message}`);
    return false;
  }

  return true;
}

async function clearStoryMessagesRequest(token: string, storyId: number) {
  const response = await safeFetch(
    `/api/s/${storyId}/messages`,
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
    console.error(`❌ Failed to clear messages: ${message}`);
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
    { auth: AUTH_BASE_URL, app: APP_BASE_URL },
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
    { auth: AUTH_BASE_URL, app: APP_BASE_URL },
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
    "\n💬 Entering chat mode. Commands: /handler to switch handlers, /provider to switch providers, /clear to clear all messages, /exit to go back.",
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

  let provider = storyDetails.provider ?? PROVIDERS[0];

  console.log(`⚙️  Using handler "${handler}" and provider "${provider}".`);

  while (true) {
    // For live handler, use event builder; otherwise use simple text input
    let userInput: unknown;
    try {
      if (handler === "live") {
        userInput = await buildLiveEventInput();
      } else {
        const rawMessage = await input({
          message: "You",
        });
        userInput = rawMessage;
      }
    } catch (error) {
      if (isPromptAbortError(error)) {
        console.log("\n👋 Leaving chat.");
        return;
      }
      throw error;
    }

    // Handle string commands
    if (typeof userInput === "string") {
      if (!userInput) {
        console.log("⚠️  Message cannot be empty.");
        continue;
      }

      const command = userInput.toLowerCase();
      if (command === "/exit" || command === "/back" || command === "/quit") {
        console.log("👋 Leaving chat.");
        return;
      }

      if (command === "/clear") {
        try {
          const confirmed = await confirm({
            message: "Are you sure you want to clear all messages from this story?",
            default: false,
          });

          if (confirmed) {
            const deletedCount = await clearStoryMessagesRequest(token, storyRecord.id);
            if (deletedCount !== null) {
              console.log(`🗑️  Cleared ${deletedCount} message(s) from this story.`);
            }
          } else {
            console.log("❌ Clear cancelled.");
          }
        } catch (error) {
          if (isPromptAbortError(error)) {
            console.log("❌ Clear cancelled.");
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
    }

    // Display user input
    const displayMessage = typeof userInput === "string"
      ? userInput
      : JSON.stringify(userInput, null, 2);
    console.log(`\n🧑 You: ${displayMessage}`);

    // Stream the conversation
    await streamStoryConversation({
      token,
      storyId: storyRecord.id,
      handler,
      provider,
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
    { auth: AUTH_BASE_URL, app: APP_BASE_URL },
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
      `❌ Streaming interrupted: ${
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
  const endpoint =
    typeof storyId === "number"
      ? `/api/s/${storyId}/handlers`
      : "/api/s/handlers";

  const response = await safeFetch(
    endpoint,
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
    { auth: AUTH_BASE_URL, app: APP_BASE_URL },
  );

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    console.error(`❌ Failed to load story: ${message}`);
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

function displayParsedResponse(handler: string, payload: string) {
  const raw = payload.trim();
  if (!raw) return;

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }

  // Handle simple handler output
  if (handler === "simple" && parsed && typeof parsed === "object") {
    const message = (parsed as { response?: unknown }).response;
    if (typeof message === "string" && message.trim().length > 0) {
      console.log(`\n📝 Message: ${message}`);
    }
    return;
  }

  // Handle live handler output (clips with body, face, speech)
  if (handler === "live" && parsed && typeof parsed === "object") {
    const data = parsed as { clips?: Array<{ body?: string; face?: string; speech?: string }> };
    if (Array.isArray(data.clips) && data.clips.length > 0) {
      console.log("\n🎬 VTuber Response:");
      data.clips.forEach((clip, index) => {
        if (data.clips!.length > 1) {
          console.log(`\n  Clip ${index + 1}/${data.clips!.length}:`);
        }
        if (clip.body) {
          console.log(`    💃 Body: ${clip.body}`);
        }
        if (clip.face) {
          console.log(`    😊 Face: ${clip.face}`);
        }
        if (clip.speech) {
          console.log(`    💬 Speech: ${clip.speech}`);
        }
      });
      return;
    }
  }

  // Fallback to raw JSON for other handlers or unparseable output
  displayRawResponse(parsed ? JSON.stringify(parsed, null, 2) : raw);
}

function displayRawResponse(content: string) {
  if (!content.trim()) return;
  console.log("\n📦 Raw response:");
  console.log(content);
}

export {
  browseStories,
  chatWithStory,
  fetchHandlers,
  fetchStoryDetails,
  printStoryDetails,
  selectProvider,
  selectStoryHandler,
};
