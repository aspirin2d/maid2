import { handleAuth, handleLogout } from "./auth.js";
import { browseStories } from "./stories.js";
import { browseMemories } from "./memories.js";
import {
  executeWithSession,
  isLoggedIn,
  APP_BASE_URL,
  type CommandContext,
  type CommandDefinition,
  type SessionRecord,
} from "./core.js";
import { showHelp } from "./lib.js";

const COMMANDS: CommandDefinition[] = [
  {
    name: "/help",
    description: "Show available commands",
    isVisible: () => true,
    handler: async ({ session }) => {
      showHelp(session, visibleCommands(session), APP_BASE_URL);
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
    handler: async ({ session }) => {
      await executeWithSession(session, browseStories);
    },
  },
  {
    name: "/memory",
    description: "Browse and delete your memories",
    isVisible: isLoggedIn,
    handler: async ({ session }) => {
      await executeWithSession(session, browseMemories);
    },
  },
  {
    name: "/logout",
    description: "Sign out and clear the saved session",
    isVisible: isLoggedIn,
    handler: async ({ session }) => {
      await handleLogout(session);
    },
  },
  {
    name: "/exit",
    description: "Close this CLI",
    isVisible: () => true,
    handler: async (): Promise<{ exit: boolean }> => ({ exit: true }),
  },
];

const COMMAND_LOOKUP = new Map(COMMANDS.map((command) => [command.name, command]));

function visibleCommands(session: SessionRecord | null) {
  return COMMANDS.filter((command) => command.isVisible(session));
}

async function runCommand(name: string, context: CommandContext) {
  const command = COMMAND_LOOKUP.get(name);
  if (!command) {
    throw new Error(`Command ${name} not found.`);
  }
  return command.handler(context);
}

export { COMMANDS, COMMAND_LOOKUP, runCommand, visibleCommands };

