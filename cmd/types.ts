import type { MemoryCategory } from "./constants.js";

// Shared type definitions for the Maid CLI

// ============================================================================
// Session & User Types
// ============================================================================

export type SessionPayload = {
  session: {
    id: string;
    createdAt: string;
    updatedAt: string;
    userId: string;
    expiresAt: string;
    token: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  };
  user: SessionUser;
};

export type SessionUser = {
  id: string;
  createdAt: string;
  updatedAt: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  image?: string | null;
  role?: string | null;
};

export type SessionRecord = {
  token: string;
  session: SessionPayload | null;
  user: SessionUser | null;
  storedAt: string;
  baseURL: string;
};

// ============================================================================
// Stories & Memories
// ============================================================================

export type StoryRecord = {
  id: number;
  userId: string;
  name: string;
  embeddingProvider: string;
  llmProvider: string;
  handler: string;
  createdAt: string;
  updatedAt: string;
};

export type StoryHandlerInfo = {
  name: string;
};

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

// ============================================================================
// Command Interfaces
// ============================================================================

export type CommandResult = {
  exit?: boolean;
};

export interface CommandDefinition {
  name: string;
  description: string;
  aliases?: string[];
  isVisible?: (session: SessionRecord | null) => boolean;
  handler: CommandHandler;
}

export interface CommandContext {
  session: SessionRecord | null;
  rawInput: string;
  args: string[];
  command: CommandDefinition;
}

export type CommandHandler = (
  context: CommandContext,
) => Promise<CommandResult | void>;
