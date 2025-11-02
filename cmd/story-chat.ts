import { input, select } from "@inquirer/prompts";

import { extractErrorMessage, parseJSON, safeFetch } from "./http.js";
import { isPromptAbortError } from "./prompts.js";
import { readSSE } from "./sse.js";
import type { ProviderOption, StoryHandlerInfo, StoryRecord } from "./types.js";
import { formatTimestamp } from "./utils.js";

const PROVIDERS: ProviderOption[] = ["ollama", "openai"];

type StreamArgs = {
  token: string;
  storyId: number;
  handler: string;
  provider: ProviderOption;
  input: unknown;
};

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

  let provider = storyDetails.provider ?? PROVIDERS[0];

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

    const message = rawMessage;
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

  if (handler === "simple" && parsed && typeof parsed === "object") {
    const message = (parsed as { answer?: unknown }).answer;
    if (typeof message === "string" && message.trim().length > 0) {
      console.log(`\n📝 Message: ${message}`);
    }
    return;
  }

  displayRawResponse(parsed ? JSON.stringify(parsed, null, 2) : raw);
}

function displayRawResponse(content: string) {
  if (!content.trim()) return;
  console.log("\n📦 Raw response:");
  console.log(content);
}

export {
  chatWithStory,
  fetchHandlers,
  fetchStoryDetails,
  printStoryDetails,
  selectProvider,
  selectStoryHandler,
};
