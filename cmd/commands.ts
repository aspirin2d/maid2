import { handleAuth, handleLogout } from "./auth.js";
import {
  browseStories,
  chatStoryCommand,
  clearStoryMessagesCommand,
  createStoryCommand,
  deleteStoryCommand,
  listStoryHandlersCommand,
  listStoriesCommand,
  renameStoryCommand,
} from "./stories.js";
import {
  browseMemories,
  createMemoryCommand,
  deleteMemoryCommand,
  editMemoryCommand,
  extractMemoriesCommand,
  listMemoriesCommand,
  viewMemoryCommand,
} from "./memories.js";
import {
  browseUsers,
  handleUserCommand,
  handleApiKeyCommand,
} from "./admin.js";
import {
  APP_BASE_URL,
  executeWithSession,
  isLoggedIn,
  isAdmin,
  type CommandContext,
  type CommandDefinition,
  type CommandResult,
  type SessionRecord,
  type SubcommandDefinition,
} from "./core.js";
import { showHelp } from "./lib.js";

type ResolvedCommand = {
  command: CommandDefinition;
  subcommand?: SubcommandDefinition;
  args: string[];
};

function withSession(
  context: CommandContext,
  missingSessionMessage: string,
  action: (token: string, session: SessionRecord) => Promise<CommandResult | void>,
) {
  return executeWithSession(context.session, action, {
    missingSessionMessage,
  });
}

const COMMANDS: CommandDefinition[] = [
  {
    name: "/help",
    description: "Show available commands",
    handler: async (context) => {
      const commands = visibleCommands(context.session);
      showHelp(context.session, commands, APP_BASE_URL);
    },
  },
  {
    name: "/login",
    description: "Sign in with your email and password",
    isVisible: (session) => !isLoggedIn(session),
    handler: async () => {
      await handleAuth("login");
    },
  },
  {
    name: "/signup",
    description: "Create a new account",
    isVisible: (session) => !isLoggedIn(session),
    handler: async () => {
      await handleAuth("signup");
    },
  },
  {
    name: "/story",
    description: "Browse, edit, or delete stories",
    isVisible: isLoggedIn,
    handler: async (context) => {
      await withSession(
        context,
        "No active session. Log in before managing stories.",
        (token, _session) => browseStories(token),
      );
    },
    subcommands: [
      {
        name: "list",
        description: "List your stories with basic details",
        handler: async (context) => {
          await withSession(
            context,
            "No active session. Log in before listing stories.",
            (token, _session) => listStoriesCommand(token),
          );
        },
      },
      {
        name: "create",
        description: "Create a new story interactively",
        handler: async (context) => {
          await withSession(
            context,
            "No active session. Log in before creating stories.",
            (token, _session) => createStoryCommand(token),
          );
        },
      },
      {
        name: "chat",
        description: "Open a chat session with a story",
        usage: "<storyId>",
        handler: async (context) => {
          await withSession(
            context,
            "No active session. Log in before chatting with stories.",
            (token, _session) => chatStoryCommand(token, context.args),
          );
        },
      },
      {
        name: "rename",
        description: "Rename a story",
        usage: "<storyId> [new name]",
        handler: async (context) => {
          await withSession(
            context,
            "No active session. Log in before renaming stories.",
            (token, _session) => renameStoryCommand(token, context.args),
          );
        },
      },
      {
        name: "delete",
        description: "Delete a story",
        usage: "<storyId>",
        handler: async (context) => {
          await withSession(
            context,
            "No active session. Log in before deleting stories.",
            (token, _session) => deleteStoryCommand(token, context.args),
          );
        },
      },
      {
        name: "clear",
        description: "Clear all messages for a story",
        usage: "<storyId>",
        handler: async (context) => {
          await withSession(
            context,
            "No active session. Log in before clearing story messages.",
            (token, _session) => clearStoryMessagesCommand(token, context.args),
          );
        },
      },
      {
        name: "handlers",
        description: "List available story handlers",
        usage: "[storyId]",
        handler: async (context) => {
          await withSession(
            context,
            "No active session. Log in before listing handlers.",
            (token, _session) => listStoryHandlersCommand(token, context.args),
          );
        },
      },
    ],
  },
  {
    name: "/memory",
    description: "Browse, create, edit, and delete your memories",
    isVisible: isLoggedIn,
    handler: async (context) => {
      await withSession(
        context,
        "No active session. Log in before managing memories.",
        (token, _session) => browseMemories(token),
      );
    },
    subcommands: [
      {
        name: "list",
        description: "List your stored memories",
        handler: async (context) => {
          await withSession(
            context,
            "No active session. Log in before listing memories.",
            (token, _session) => listMemoriesCommand(token),
          );
        },
      },
      {
        name: "view",
        description: "View the details of a memory",
        usage: "<memoryId>",
        handler: async (context) => {
          await withSession(
            context,
            "No active session. Log in before viewing memories.",
            (token, _session) => viewMemoryCommand(token, context.args),
          );
        },
      },
      {
        name: "create",
        description: "Create a new memory",
        handler: async (context) => {
          await withSession(
            context,
            "No active session. Log in before creating memories.",
            (token, _session) => createMemoryCommand(token),
          );
        },
      },
      {
        name: "edit",
        description: "Edit an existing memory",
        usage: "<memoryId>",
        handler: async (context) => {
          await withSession(
            context,
            "No active session. Log in before editing memories.",
            (token, _session) => editMemoryCommand(token, context.args),
          );
        },
      },
      {
        name: "delete",
        description: "Delete a memory",
        usage: "<memoryId>",
        handler: async (context) => {
          await withSession(
            context,
            "No active session. Log in before deleting memories.",
            (token, _session) => deleteMemoryCommand(token, context.args),
          );
        },
      },
      {
        name: "extract",
        description: "Extract memories from recent messages",
        handler: async (context) => {
          await withSession(
            context,
            "No active session. Log in before extracting memories.",
            (token, _session) => extractMemoriesCommand(token),
          );
        },
      },
    ],
  },
  {
    name: "/admin",
    description: "Admin panel for user management (admin only)",
    isVisible: isAdmin,
    handler: async (context) => {
      await withSession(
        context,
        "No active session. Log in before accessing admin panel.",
        (token, session) => browseUsers(token, session.user?.id ?? null),
      );
    },
    subcommands: [
      {
        name: "user",
        description: "Manage users",
        usage: "<list|create|view|role|ban|unban>",
        aliases: ["users"],
        handler: async (context) => {
          await withSession(
            context,
            "No active session. Log in before managing users.",
            (token, session) => handleUserCommand(token, session.user?.id ?? null, context.args),
          );
        },
      },
      {
        name: "key",
        description: "Manage API keys",
        usage: "<list|view|create|delete|toggle>",
        handler: async (context) => {
          await withSession(
            context,
            "No active session. Log in before managing API keys.",
            (token, session) => handleApiKeyCommand(token, session.user!.email, context.args),
          );
        },
      },
    ],
  },
  {
    name: "/logout",
    description: "Sign out and clear the saved session",
    isVisible: isLoggedIn,
    handler: async (context) => {
      await handleLogout(context.session);
    },
  },
  {
    name: "/exit",
    description: "Close this CLI",
    handler: async (): Promise<CommandResult> => ({ exit: true }),
  },
];

const COMMAND_LOOKUP = buildCommandLookup(COMMANDS);

function buildCommandLookup(commands: CommandDefinition[]) {
  const lookup = new Map<string, CommandDefinition>();
  for (const command of commands) {
    const identifiers = [command.name, ...(command.aliases ?? [])];
    for (const id of identifiers) {
      lookup.set(id, command);
    }
  }
  return lookup;
}

function isVisible(command: CommandDefinition, session: SessionRecord | null) {
  if (typeof command.isVisible === "function") {
    return command.isVisible(session);
  }
  return true;
}

function visibleCommands(session: SessionRecord | null) {
  return COMMANDS.filter((command) => isVisible(command, session));
}

function findSubcommand(
  command: CommandDefinition,
  token: string,
): SubcommandDefinition | undefined {
  const candidates = command.subcommands ?? [];
  for (const sub of candidates) {
    const identifiers = [sub.name, ...(sub.aliases ?? [])];
    if (identifiers.includes(token)) {
      return sub;
    }
  }
  return undefined;
}

function resolveCommandInput(
  rawInput: string,
  availableCommands: CommandDefinition[],
): ResolvedCommand | null {
  const normalized = rawInput.trim();
  if (!normalized) {
    return null;
  }

  const parts = normalized.split(/\s+/);
  const [first, ...rest] = parts;
  const command = COMMAND_LOOKUP.get(first);
  if (!command || !availableCommands.includes(command)) {
    return null;
  }

  if (!rest.length || !(command.subcommands?.length)) {
    return { command, args: rest };
  }

  const subcommand = findSubcommand(command, rest[0]);
  if (!subcommand) {
    return { command, args: rest };
  }

  return {
    command,
    subcommand,
    args: rest.slice(1),
  };
}

function availableCommandInputs(commands: CommandDefinition[]) {
  const inputs = new Set<string>();
  for (const command of commands) {
    inputs.add(command.name);
    if (command.subcommands?.length) {
      for (const sub of command.subcommands) {
        inputs.add(`${command.name} ${sub.name}`);
        for (const alias of sub.aliases ?? []) {
          inputs.add(`${command.name} ${alias}`);
        }
      }
    }
    for (const alias of command.aliases ?? []) {
      inputs.add(alias);
    }
  }
  return Array.from(inputs);
}

async function runCommand(input: string, session: SessionRecord | null) {
  const commands = visibleCommands(session);
  const resolved = resolveCommandInput(input, commands);
  if (!resolved) {
    throw new Error(`Command ${input} not found.`);
  }

  const context: CommandContext = {
    session,
    rawInput: input,
    args: resolved.args,
    command: resolved.command,
    subcommand: resolved.subcommand,
  };

  const handler = resolved.subcommand
    ? resolved.subcommand.handler
    : resolved.command.handler;

  return handler(context);
}

export {
  COMMANDS,
  COMMAND_LOOKUP,
  availableCommandInputs,
  resolveCommandInput,
  runCommand,
  visibleCommands,
};
