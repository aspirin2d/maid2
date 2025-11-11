# Live Handler Event Schema

The live handler supports event-driven input for handling the core interactions in live streaming scenarios. This document describes the available event types and their usage.

## Overview

The event-based input system allows the VTuber handler to respond to three core types of events:

- User messages (chat and bullet chat/danmaku)
- Gift/donation events
- Program transitions (live stream state changes)

## Backward Compatibility

The handler maintains full backward compatibility with the original input formats:

```typescript
// Legacy simple string
"Hello, how are you?"

// Legacy object format
{
  prompt: "Hello, how are you?",
  message: "Hello, how are you?",
  question: "Hello, how are you?",
  input: "Hello, how are you?"
}
```

These formats are automatically converted to `user_chat` events internally.

## Event Types

### 1. User Chat Event

All user messages including regular chat, bullet chat (danmaku/弹幕), and any text input from viewers.

```typescript
{
  type: "user_chat",
  data: {
    message: "今天天气真好！",
    username: "user123",        // optional
    timestamp: 1635724800000    // optional
  }
}
```

**When to use:**
- Regular chat interactions, Q&A sessions, direct conversations
- Live stream comments, bullet chat/danmaku
- Any text-based viewer input

**Example scenarios:**
```typescript
// Regular conversation
{ type: "user_chat", data: { message: "今天天气真好！", username: "user123" }}

// Bullet chat (danmaku)
{ type: "user_chat", data: { message: "哈哈哈", username: "viewer456" }}

// Quick reaction
{ type: "user_chat", data: { message: "666" }}
```

### 2. Gift Event

When viewers send gifts or donations during the stream.

```typescript
{
  type: "gift_event",
  data: {
    username: "generous_fan",
    giftName: "超级火箭",
    giftCount: 3,
    giftValue: 299.99,             // optional: monetary value
    message: "继续加油！"           // optional: message with gift
  }
}
```

**When to use:** Processing donations, gifts, super chats, or any viewer monetary support.

**VTuber response expectations:**
- Thank the user
- React appropriately to gift size
- Read and respond to accompanying message
- Show excitement/gratitude

**Example scenarios:**
```typescript
// Simple gift
{ type: "gift_event", data: { username: "fan123", giftName: "玫瑰", giftCount: 1 }}

// Multiple gifts with message
{ type: "gift_event", data: { username: "generous_fan", giftName: "超级火箭", giftCount: 3, message: "继续加油！" }}

// High-value donation
{ type: "gift_event", data: { username: "whale", giftName: "嘉年华", giftCount: 5, giftValue: 1499.95 }}
```

### 3. Program Event

Notifications about program/segment transitions during a live stream - state changes of the live broadcast.

```typescript
{
  type: "program_event",
  data: {
    action: "finish",              // "start" | "finish" | "pause" | "resume"
    programName: "歌回",
    programId: "singing-001",      // optional
    programType: "singing",        // optional: "singing" | "chatting" | "gaming" | "drawing" | "other"
    duration: 3600,                // optional: duration in seconds (for finish events)
    metadata: {                    // optional: custom metadata
      songsPerformed: 5,
      viewersPeak: 1200
    }
  }
}
```

**When to use:**
- Starting a new program segment
- Finishing a program segment
- Pausing or resuming a program
- Transitioning between different activities

**Example scenarios:**
```typescript
// Starting a singing session
{ type: "program_event", data: { action: "start", programName: "歌回", programType: "singing" }}

// Finishing a game
{ type: "program_event", data: { action: "finish", programName: "Minecraft", programType: "gaming", duration: 7200 }}

// Taking a break
{ type: "program_event", data: { action: "pause", programName: "自由聊天" }}

// Resuming after break
{ type: "program_event", data: { action: "resume", programName: "自由聊天" }}
```

## Integration Examples

### REST API Usage

```typescript
// POST /api/stories/:storyId/message
// Body can be any valid event

// Simple message (backward compatible)
{
  "message": "Hello!"
}

// User chat
{
  "type": "user_chat",
  "data": {
    "message": "666",
    "username": "viewer123"
  }
}

// Gift event
{
  "type": "gift_event",
  "data": {
    "username": "generous_fan",
    "giftName": "超级火箭",
    "giftCount": 3
  }
}

// Program finished
{
  "type": "program_event",
  "data": {
    "action": "finish",
    "programName": "游戏时间",
    "programType": "gaming",
    "duration": 5400
  }
}
```

### Frontend Integration

```typescript
import type { LiveEvent } from './handlers/live/events';

class LiveStreamClient {
  // Send user message (chat or bullet chat)
  sendMessage(message: string, username?: string) {
    const event: LiveEvent = {
      type: "user_chat",
      data: { message, username }
    };
    return this.sendEvent(event);
  }

  // Send gift
  sendGift(username: string, giftName: string, count: number, message?: string, giftValue?: number) {
    const event: LiveEvent = {
      type: "gift_event",
      data: { username, giftName, giftCount: count, message, giftValue }
    };
    return this.sendEvent(event);
  }

  // Notify program change
  startProgram(programName: string, programType?: string) {
    const event: LiveEvent = {
      type: "program_event",
      data: { action: "start", programName, programType }
    };
    return this.sendEvent(event);
  }

  finishProgram(programName: string, duration?: number, programType?: string) {
    const event: LiveEvent = {
      type: "program_event",
      data: { action: "finish", programName, duration, programType }
    };
    return this.sendEvent(event);
  }

  pauseProgram(programName: string) {
    const event: LiveEvent = {
      type: "program_event",
      data: { action: "pause", programName }
    };
    return this.sendEvent(event);
  }

  resumeProgram(programName: string) {
    const event: LiveEvent = {
      type: "program_event",
      data: { action: "resume", programName }
    };
    return this.sendEvent(event);
  }

  private async sendEvent(event: LiveEvent) {
    const response = await fetch(`/api/stories/${this.storyId}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event)
    });
    return response;
  }
}
```

### Event Processing Pipeline

The handler processes events through the following pipeline:

1. **Input Normalization**: Legacy formats are converted to event format
2. **Event Context Building**: Extract context based on event type
3. **Memory Search**: Relevant events trigger memory lookup
4. **Prompt Building**: Event context is added with appropriate headers
5. **Response Generation**: VTuber generates clips (body, face, speech)
6. **Message Persistence**: Event text is saved to chat history

## Best Practices

### When to Use Each Event Type

| Scenario | Event Type | Reason |
|----------|------------|--------|
| User messages, chat, danmaku | `user_chat` | All text-based viewer input |
| Donations/gifts | `gift_event` | Proper acknowledgment and gratitude |
| Segment transitions | `program_event` | Track stream structure and state changes |

### Event Frequency Considerations

- **High frequency** (user_chat): May not require response to every message
- **Medium frequency** (gift_event): Should acknowledge each
- **Low frequency** (program_event): Always process

### Response Expectations

Different events have different response expectations:

- **user_chat**: Direct answer, conversation, or optional acknowledgment depending on context
- **gift_event**: Gratitude, excitement, read accompanying message
- **program_event**: Transition commentary, setup/wrapup, mood adjustment

## Schema Validation

All events are validated using Zod schemas. Invalid events will be rejected:

```typescript
import { liveInputSchema } from './handlers/live/events';

// Validate input
try {
  const validated = liveInputSchema.parse(userInput);
  // Process validated input
} catch (error) {
  // Handle validation error
  console.error('Invalid event format:', error);
}
```

## Migration Guide

If you're upgrading from older versions:

### Before (v1.0.0)
```typescript
// Only supported simple text
POST /api/stories/123/message
{ "message": "Hello" }
```

### After (v2.1.0 - Simplified)
```typescript
// Still supports simple text (backward compatible)
POST /api/stories/123/message
{ "message": "Hello" }

// Now supports three core event types
POST /api/stories/123/message
{
  "type": "user_chat",
  "data": {
    "message": "Hello",
    "username": "viewer123"
  }
}
```

### Migrating from v2.0.0 to v2.1.0

Event type changes:
- `bullet_chat` → Use `user_chat` instead (all user messages unified)
- `user_interaction` → Removed (use `user_chat` for acknowledgments)
- `system_event` → Removed (handle via external system or use `user_chat` for notifications)
- `emotion_event` → Removed (emotional state expressed naturally in responses)

No breaking changes - all existing code continues to work!

## Extending the Event System

To add new event types beyond the core three:

1. Add schema to `events.ts`:
```typescript
const myCustomEventSchema = z.object({
  type: z.literal("my_custom_event"),
  data: z.object({
    // your fields
  })
});
```

2. Add to discriminated union:
```typescript
export const liveEventSchema = z.discriminatedUnion("type", [
  userChatEventSchema,
  giftEventSchema,
  programEventSchema,
  simpleTextEventSchema,
  myCustomEventSchema,  // add your schema here
]);
```

3. Update helper functions in `events.ts`:
```typescript
export function extractEventText(event: LiveEvent): string | null {
  switch (event.type) {
    // ... existing cases
    case "my_custom_event":
      return // your logic to extract displayable text
  }
}

export function getEventContext(event: LiveEvent): string {
  switch (event.type) {
    // ... existing cases
    case "my_custom_event":
      return // your logic to build context for the prompt
  }
}
```

4. Update prompt builder in `prompt-builder.ts` if needed for special handling.

5. Update this documentation to describe the new event type.
