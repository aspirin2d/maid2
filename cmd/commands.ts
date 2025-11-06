import { handleAuth, handleLogout } from "./auth.js";
import { browseStories } from "./stories.js";
import { browseMemories } from "./memories.js";
import { browseAdmin } from "./admin.js";
import {
  executeWithSession,
  isLoggedIn,
  isAdmin,
  type CommandContext,
  type CommandDefinition,
  type CommandResult,
  type SessionRecord,
} from "./core.js";

type ResolvedCommand = {
  command: CommandDefinition;
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
    aliases: ["/s"],
    description: "Browse and manage your stories",
    isVisible: isLoggedIn,
    handler: async (context) => {
      await withSession(
        context,
        "No active session. Log in before managing stories.",
        (token, _session) => browseStories(token),
      );
    },
  },
  {
    name: "/memory",
    aliases: ["/m"],
    description: "Browse and manage your memories",
    isVisible: isLoggedIn,
    handler: async (context) => {
      await withSession(
        context,
        "No active session. Log in before managing memories.",
        (token, _session) => browseMemories(token),
      );
    },
  },
  {
    name: "/admin",
    aliases: ["/a"],
    description: "Admin panel for user and API key management (admin only)",
    isVisible: isAdmin,
    handler: async (context) => {
      await withSession(
        context,
        "No active session. Log in before accessing admin panel.",
        (token, session) => browseAdmin(token, session.user?.id ?? null, session.user?.email ?? ""),
      );
    },
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
    aliases: ["/e", "/q"],
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

  return { command, args: rest };
}

function availableCommandInputs(commands: CommandDefinition[]) {
  const inputs = new Set<string>();
  for (const command of commands) {
    inputs.add(command.name);
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
  };

  return resolved.command.handler(context);
}

export {
  COMMANDS,
  COMMAND_LOOKUP,
  availableCommandInputs,
  resolveCommandInput,
  runCommand,
  visibleCommands,
};
