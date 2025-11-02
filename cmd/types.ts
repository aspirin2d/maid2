export type SessionRecord = {
  token: string;
  session: SessionPayload | null;
  user: SessionUser | null;
  storedAt: string;
  baseURL: string;
};

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
};

export type StoryRecord = {
  id: number;
  userId: string;
  name: string;
  provider: ProviderOption;
  handler: string;
  createdAt: string;
  updatedAt: string;
};

export type StoryHandlerInfo = {
  name: string;
};

export type ProviderOption = "openai" | "ollama";

export type CommandContext = {
  session: SessionRecord | null;
};

export type CommandOutcome = {
  exit?: boolean;
};

export type CommandDefinition = {
  name: string;
  description: string;
  isVisible: (session: SessionRecord | null) => boolean;
  handler: (context: CommandContext) => Promise<CommandOutcome | void>;
};
