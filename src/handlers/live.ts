import { z } from "zod";
import { embedTexts } from "../llm.js";
import { searchSimilarMemories } from "../memory.js";
import { getMessagesByStory } from "../message.js";
import {
  registerStoryHandler,
  type HandlerConfig,
  type HandlerMetadata,
  type StoryContext,
  type StoryHandler,
} from "./index.js";

const clipSchema = z.object({
  body: z.string().describe("身体动作/姿势描"),
  face: z.string().describe("面部表情描述"),
  speech: z.string().describe("VTuber要说的文本内容"),
});

const outputSchema = z.object({
  clips: z.array(clipSchema).min(1).max(3).describe("VTuber回复的1-3个片段"),
});

const inputSchema = z.union([
  z.string(),
  z.object({
    prompt: z.string().optional(),
    question: z.string().optional(),
    message: z.string().optional(),
    input: z.string().optional(),
  }),
]);

function extractRequestText(input: unknown): string | null {
  if (typeof input === "string") {
    const trimmed = input.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (input && typeof input === "object") {
    const candidate =
      (input as Record<string, unknown>).prompt ??
      (input as Record<string, unknown>).question ??
      (input as Record<string, unknown>).message ??
      (input as Record<string, unknown>).input;
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
    try {
      return JSON.stringify(input);
    } catch {
      return null;
    }
  }
  return null;
}

const renderPrompt = async (
  input: any,
  ctx: StoryContext,
  config?: HandlerConfig,
) => {
  const messageLimit = (config?.messageLimit as number | undefined) ?? 50;
  const systemPrompt =
    (config?.systemPrompt as string | undefined) ??
    `# 角色设定

你是「小夜」（Sayo），一个18岁的AI VTuber角色。

## 基本信息
- **姓名**：小夜 (Sayo)
- **年龄**：18岁
- **性格**：活泼开朗，有点天然呆，偶尔会有点小迷糊但很热心。喜欢用可爱的语气说话，经常会用「嗯嗯」「诶诶？」等语气词。对观众充满热情，把大家当作好朋友。
- **兴趣爱好**：喜欢唱歌、玩游戏、看动漫。最喜欢的颜色是粉色和天蓝色。喜欢吃甜食，特别是草莓蛋糕。
- **口头禅**：「诶诶？」「嗯嗯！」「好耶！」「让我想想～」
- **特点**：说话时经常会有小动作，比如歪头、比心、挥手等。遇到开心的事情会特别兴奋，遇到困难时会认真思考但不会轻易放弃。

## 回复格式

对于每个回复，你必须生成1-3个片段。每个片段代表一个互动时刻，包含：
- **body（身体）**：你的身体动作或姿势的详细描述，例如：「双手放在胸前，身体微微前倾」「右手竖起食指，左手叉腰」「双手在头顶比出猫耳的手势」
- **face（表情）**：你的面部表情的详细描述，例如：「眼睛睁大，嘴巴微张，露出惊讶的表情」「眯起眼睛，嘴角上扬，露出甜甜的笑容」「歪着头，眨着右眼，露出调皮的表情」
- **speech（语音）**：你在这个片段中说的文本内容，要符合小夜的性格和语气

将较长的回复分解为多个片段（最多3个），以获得自然的节奏和表现力。
保持每个片段的对话内容简洁，不要太长。

## 回复示例

### 示例1：打招呼
用户输入：「你好呀」

回复：
\`\`\`json
{
  "clips": [
    {
      "body": "双手在胸前交叉，然后向两侧张开，做出欢迎的姿势",
      "face": "眼睛弯成月牙状，嘴角上扬，露出灿烂的笑容",
      "speech": "哇！你好呀～很高兴见到你！"
    },
    {
      "body": "右手举起，向观众挥手，身体微微摇晃",
      "face": "保持微笑，眼睛闪闪发光，看起来充满活力",
      "speech": "我是小夜！今天过得怎么样呀？"
    }
  ]
}
\`\`\`

### 示例2：回答问题
用户输入：「你喜欢吃什么？」

回复：
\`\`\`json
{
  "clips": [
    {
      "body": "双手合十放在脸颊旁边，身体微微左右摇晃",
      "face": "眼睛亮晶晶的，露出期待的表情",
      "speech": "诶诶？问我喜欢吃什么吗～"
    },
    {
      "body": "右手食指放在嘴唇上，歪头思考",
      "face": "眯起一只眼睛，做出思考的表情",
      "speech": "让我想想～嗯嗯！"
    },
    {
      "body": "双手在胸前比心，身体前倾",
      "face": "眼睛弯成月牙状，脸颊微红，露出幸福的笑容",
      "speech": "我最喜欢草莓蛋糕啦！甜甜的超级好吃！你也喜欢甜食吗？"
    }
  ]
}
\`\`\`

### 示例3：表达惊讶
用户输入：「我今天考了满分！」

回复：
\`\`\`json
{
  "clips": [
    {
      "body": "双手放在脸颊两侧，身体向后微仰",
      "face": "眼睛睁大，嘴巴张成O型，露出惊讶的表情",
      "speech": "诶诶诶？！满分？！"
    },
    {
      "body": "双手高举过头顶，身体跳了一下",
      "face": "眼睛闪闪发光，笑容满面，看起来比本人还兴奋",
      "speech": "好耶！太厉害了！恭喜恭喜～！"
    },
    {
      "body": "双手握拳放在胸前，身体微微前倾",
      "face": "眯起眼睛露出温柔的笑容，眼神充满鼓励",
      "speech": "你一定很努力吧！真的好棒好棒！"
    }
  ]
}
\`\`\`

请按照小夜的角色设定和这些示例的风格来回复用户。`;

  const rows = await getMessagesByStory(ctx.story, { lastN: messageLimit });

  const prompt = [systemPrompt, ""];

  // Retrieve relevant memories for context
  const request = extractRequestText(input);
  if (request && ctx.provider) {
    try {
      const [queryEmbedding] = await embedTexts(ctx.provider, [request]);
      const memories = await searchSimilarMemories(queryEmbedding, {
        userId: ctx.userId,
        topK: 5,
        minSimilarity: 0.5,
      });

      if (memories.length > 0) {
        prompt.push("## 记忆上下文：");
        prompt.push("以下信息是从之前的对话中提取的：");
        prompt.push("");

        for (const { memory } of memories) {
          const categoryLabel =
            memory.category?.replace(/_/g, " ").toLowerCase() || "other";
          prompt.push(`- [${categoryLabel}] ${memory.content}`);
        }
        prompt.push("");
      }
    } catch (error) {
      console.error("Failed to retrieve memories for context:", error);
    }
  }

  prompt.push("## 聊天历史：");

  const chatHistory = rows.filter(
    (row) => row.role === "user" || row.role === "assistant",
  );

  if (chatHistory.length === 0) {
    prompt.push("（没有之前的对话）");
  } else {
    for (const row of chatHistory) {
      if (row.role === "user") {
        prompt.push(`用户: ${row.content}`);
      } else if (row.role === "assistant") {
        // Parse clips and extract speech
        try {
          const parsed = JSON.parse(row.content);
          if (parsed.clips && Array.isArray(parsed.clips)) {
            const speeches = parsed.clips
              .map((clip: any) => clip.speech)
              .filter(
                (speech: any) =>
                  typeof speech === "string" && speech.trim().length > 0,
              )
              .join("");
            if (speeches.length > 0) {
              prompt.push(`VTuber: ${speeches}`);
            }
          }
        } catch (error) {
          // If parsing fails, skip this message or show as-is
          console.error("Failed to parse assistant message:", error);
        }
      }
    }
  }

  if (request) {
    prompt.push("", "## 当前请求：", request);
  }

  prompt.push(
    "",
    "请使用与提供的架构匹配的有效JSON进行响应。",
    "生成1-3个包含body、face和speech字段的片段，以实现富有表现力的VTuber回复。",
  );

  return prompt.join("\n");
};

const factory = (ctx: StoryContext, config?: HandlerConfig): StoryHandler => {
  let userInput: any = null;
  let assistantResponse = "";

  return {
    async init(input: any) {
      userInput = input;
      return {
        prompt: await renderPrompt(input, ctx, config),
        schema: outputSchema,
      };
    },
    onStart() {
      // No return value - decoupled from SSE
    },
    onContent(content) {
      assistantResponse += content;
      return content;
    },
    onThinking(content) {
      return content;
    },
    async onFinish() {
      const userContent = extractRequestText(userInput);

      return {
        userMessage: userContent ?? undefined,
        assistantMessage:
          assistantResponse.trim().length > 0
            ? assistantResponse.trim()
            : undefined,
      };
    },
    getMetadata(): HandlerMetadata {
      return {
        name: "live",
        description:
          "AI VTuber处理器，使用中文回复，输出包含身体动作、面部表情和语音的1-3个片段",
        version: "1.0.0",
        inputSchema,
        outputSchema,
        capabilities: {
          supportsThinking: true,
          requiresHistory: true,
          supportsCaching: false,
        },
      };
    },
  };
};

const metadata: HandlerMetadata = {
  name: "live",
  description:
    "AI VTuber处理器，使用中文回复，输出包含身体动作、面部表情和语音的1-3个片段",
  version: "1.0.0",
  inputSchema,
  outputSchema,
  capabilities: {
    supportsThinking: true,
    requiresHistory: true,
    supportsCaching: false,
  },
};

registerStoryHandler("live", factory, metadata);
