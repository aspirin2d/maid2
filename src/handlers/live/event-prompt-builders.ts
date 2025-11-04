import type { StoryContext, HandlerConfig } from "../index.js";
import type { LiveEvent } from "./events.js";
import {
  buildTimeContext,
  buildMemoryContext,
  buildChatHistory,
} from "./context/index.js";

/**
 * Event-specific prompt building strategies
 * Each event type can have customized prompt structure and context
 */

/**
 * Result from an event-specific prompt builder
 */
export interface EventPromptResult {
  sections: string[];
  searchText: string | null; // Text to use for memory search
  requiresMemory: boolean; // Whether this event needs memory context
}

/**
 * Build prompt for user_chat events
 * Regular conversation - needs full context
 */
export async function buildUserChatPrompt(
  event: Extract<LiveEvent, { type: "user_chat" }>,
  ctx: StoryContext,
  config?: HandlerConfig,
): Promise<EventPromptResult> {
  const sections: string[] = [];
  const userPrefix = event.data.username ? `${event.data.username}` : "用户";

  sections.push(`## 当前对话`);
  sections.push(`${userPrefix}: ${event.data.message}`);

  return {
    sections,
    searchText: event.data.message,
    requiresMemory: true,
  };
}

/**
 * Build prompt for bullet_chat events
 * Quick reactions - less context needed
 */
export async function buildBulletChatPrompt(
  event: Extract<LiveEvent, { type: "bullet_chat" }>,
  ctx: StoryContext,
  config?: HandlerConfig,
): Promise<EventPromptResult> {
  const sections: string[] = [];
  const userPrefix = event.data.username ? `${event.data.username}` : "观众";

  sections.push(`## 弹幕互动`);
  sections.push(`${userPrefix} 发送弹幕: ${event.data.message}`);

  if (event.data.position) {
    const positionText = {
      top: "顶部",
      bottom: "底部",
      scroll: "滚动",
    }[event.data.position];
    sections.push(`位置: ${positionText}`);
  }

  sections.push("");
  sections.push(
    "提示: 弹幕通常需要简短、活泼的回应。可以选择性回复，不必每条都详细回应。",
  );

  return {
    sections,
    searchText: event.data.message,
    requiresMemory: false, // Bullet chats don't need deep memory search
  };
}

/**
 * Build prompt for program_event
 * Program transitions - needs announcement style
 */
export async function buildProgramEventPrompt(
  event: Extract<LiveEvent, { type: "program_event" }>,
  ctx: StoryContext,
  config?: HandlerConfig,
): Promise<EventPromptResult> {
  const sections: string[] = [];

  sections.push(`## 节目状态变化`);

  const actionText = {
    start: "开始",
    finish: "结束",
    pause: "暂停",
    resume: "恢复",
  }[event.data.action];

  sections.push(`动作: ${actionText}`);
  sections.push(`节目名称: ${event.data.programName}`);

  if (event.data.programType) {
    const typeText = {
      singing: "唱歌",
      chatting: "聊天",
      gaming: "游戏",
      drawing: "绘画",
      other: "其他",
    }[event.data.programType];
    sections.push(`节目类型: ${typeText}`);
  }

  if (event.data.duration && event.data.action === "finish") {
    const hours = Math.floor(event.data.duration / 3600);
    const minutes = Math.floor((event.data.duration % 3600) / 60);
    const seconds = event.data.duration % 60;
    const timeStr = [
      hours > 0 ? `${hours}小时` : "",
      minutes > 0 ? `${minutes}分` : "",
      seconds > 0 ? `${seconds}秒` : "",
    ]
      .filter(Boolean)
      .join("");
    sections.push(`持续时长: ${timeStr}`);
  }

  sections.push("");

  // Add context hints based on action
  if (event.data.action === "start") {
    sections.push(
      `提示: 这是节目开始。应该表现出兴奋和期待，向观众介绍接下来要做什么。`,
    );
  } else if (event.data.action === "finish") {
    sections.push(
      `提示: 这是节目结束。应该感谢观众的陪伴，总结一下刚才的内容，表达对这段时间的感受。`,
    );
  } else if (event.data.action === "pause") {
    sections.push(`提示: 节目暂停。告知观众稍作休息，很快回来。`);
  } else if (event.data.action === "resume") {
    sections.push(`提示: 节目恢复。欢迎观众回来，继续之前的内容。`);
  }

  return {
    sections,
    searchText: null, // Program events don't need memory search
    requiresMemory: false,
  };
}

/**
 * Build prompt for gift_event
 * Gift received - needs gratitude and excitement
 */
export async function buildGiftEventPrompt(
  event: Extract<LiveEvent, { type: "gift_event" }>,
  ctx: StoryContext,
  config?: HandlerConfig,
): Promise<EventPromptResult> {
  const sections: string[] = [];

  sections.push(`## 收到礼物`);
  sections.push(`送礼者: ${event.data.username}`);
  sections.push(`礼物名称: ${event.data.giftName}`);
  sections.push(`数量: ${event.data.giftCount}个`);

  if (event.data.giftValue) {
    sections.push(`价值: ${event.data.giftValue}`);
  }

  if (event.data.message) {
    sections.push(`附言: ${event.data.message}`);
  }

  sections.push("");
  sections.push(
    `提示: 表达真诚的感谢和惊喜。礼物价值越高，反应应该更激动。如果有附言，记得回应附言内容。`,
  );

  return {
    sections,
    searchText: event.data.message || null, // Search on message if exists
    requiresMemory: true, // Check if this user has sent gifts before
  };
}

/**
 * Build prompt for user_interaction events
 * Follow/subscribe/like - needs welcoming response
 */
export async function buildUserInteractionPrompt(
  event: Extract<LiveEvent, { type: "user_interaction" }>,
  ctx: StoryContext,
  config?: HandlerConfig,
): Promise<EventPromptResult> {
  const sections: string[] = [];

  sections.push(`## 用户互动`);

  const actionText = {
    follow: "关注了你",
    subscribe: "订阅了你",
    like: "点赞了",
    share: "分享了直播",
  }[event.data.action];

  sections.push(`${event.data.username} ${actionText}`);

  if (event.data.action === "subscribe") {
    if (event.data.tier) {
      sections.push(`订阅等级: ${event.data.tier}`);
    }
    if (event.data.months) {
      sections.push(`已连续订阅: ${event.data.months}个月`);
    }
  }

  sections.push("");

  // Add context hints based on action
  if (event.data.action === "follow") {
    sections.push(`提示: 欢迎新的关注者，表达感谢和期待未来的互动。`);
  } else if (event.data.action === "subscribe") {
    if (event.data.months && event.data.months > 1) {
      sections.push(
        `提示: 这是一位忠实粉丝！特别感谢他们的长期支持，表达对老粉的感激。`,
      );
    } else {
      sections.push(`提示: 欢迎新订阅者，表达感谢并让他们感到受欢迎。`);
    }
  } else if (event.data.action === "like") {
    sections.push(`提示: 简短感谢点赞，表达开心。`);
  } else if (event.data.action === "share") {
    sections.push(`提示: 特别感谢分享，这帮助更多人发现直播。`);
  }

  return {
    sections,
    searchText: null,
    requiresMemory: true, // Check if this user has interacted before
  };
}

/**
 * Build prompt for system_event
 * System notifications - informational
 */
export async function buildSystemEventPrompt(
  event: Extract<LiveEvent, { type: "system_event" }>,
  ctx: StoryContext,
  config?: HandlerConfig,
): Promise<EventPromptResult> {
  const sections: string[] = [];

  sections.push(`## 系统事件`);
  sections.push(`事件类型: ${event.data.eventType}`);

  if (event.data.message) {
    sections.push(`消息: ${event.data.message}`);
  }

  const severityText = {
    info: "信息",
    warning: "警告",
    error: "错误",
  }[event.data.severity];
  sections.push(`严重程度: ${severityText}`);

  sections.push("");

  if (event.data.severity === "error") {
    sections.push(
      `提示: 这是一个错误事件。应该向观众说明情况，表示会尽快解决，保持冷静和专业。`,
    );
  } else if (event.data.severity === "warning") {
    sections.push(
      `提示: 这是一个警告。简要说明情况，告知观众正在注意这个问题。`,
    );
  } else {
    sections.push(`提示: 这是一个普通通知。可以简单提及或不做特别反应。`);
  }

  return {
    sections,
    searchText: null,
    requiresMemory: false,
  };
}

/**
 * Build prompt for emotion_event
 * Emotion state changes - needs expression
 */
export async function buildEmotionEventPrompt(
  event: Extract<LiveEvent, { type: "emotion_event" }>,
  ctx: StoryContext,
  config?: HandlerConfig,
): Promise<EventPromptResult> {
  const sections: string[] = [];

  sections.push(`## 情绪状态变化`);
  sections.push(`情绪: ${event.data.emotion}`);

  if (event.data.intensity !== undefined) {
    const intensityPercent = Math.round(event.data.intensity * 100);
    sections.push(`强度: ${intensityPercent}%`);
  }

  if (event.data.trigger) {
    sections.push(`触发原因: ${event.data.trigger}`);
  }

  if (event.data.duration) {
    sections.push(`预期持续: ${event.data.duration}秒`);
  }

  sections.push("");
  sections.push(
    `提示: 自然地表达这种情绪状态。通过语言、动作和表情展现${event.data.emotion}的感觉。`,
  );

  if (event.data.trigger) {
    sections.push(`确保回应中提到或暗示触发原因。`);
  }

  return {
    sections,
    searchText: event.data.trigger || null,
    requiresMemory: false,
  };
}

/**
 * Build prompt for simple_text (legacy support)
 * Fallback to simple text handling
 */
export async function buildSimpleTextPrompt(
  event: Extract<LiveEvent, { type: "simple_text" }>,
  ctx: StoryContext,
  config?: HandlerConfig,
): Promise<EventPromptResult> {
  const sections: string[] = [];

  sections.push(`## 当前请求`);
  sections.push(event.data.text);

  return {
    sections,
    searchText: event.data.text,
    requiresMemory: true,
  };
}

/**
 * Main dispatcher - routes to event-specific prompt builder
 */
export async function buildEventSpecificPrompt(
  event: LiveEvent,
  ctx: StoryContext,
  config?: HandlerConfig,
): Promise<EventPromptResult> {
  switch (event.type) {
    case "user_chat":
      return buildUserChatPrompt(event, ctx, config);
    case "bullet_chat":
      return buildBulletChatPrompt(event, ctx, config);
    case "program_event":
      return buildProgramEventPrompt(event, ctx, config);
    case "gift_event":
      return buildGiftEventPrompt(event, ctx, config);
    case "user_interaction":
      return buildUserInteractionPrompt(event, ctx, config);
    case "system_event":
      return buildSystemEventPrompt(event, ctx, config);
    case "emotion_event":
      return buildEmotionEventPrompt(event, ctx, config);
    case "simple_text":
      return buildSimpleTextPrompt(event, ctx, config);
    default:
      // TypeScript should ensure we never get here
      const _exhaustive: never = event;
      throw new Error(`Unknown event type: ${JSON.stringify(event)}`);
  }
}
