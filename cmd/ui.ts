import { APP_BASE_URL } from "./config.js";
import type { CommandDefinition, SessionRecord } from "./types.js";

function printWelcomeMessage() {
  console.log("\n✨ Maid CLI ready. Type a command or /help to see options.");
}

function renderStatus(session: SessionRecord | null) {
  console.log("\n────────────────────────");
  if (session?.user) {
    const displayName = session.user.name?.trim()
      ? `${session.user.name} <${session.user.email}>`
      : session.user.email;
    console.log(`👤 ${displayName}`);
  } else {
    console.log("🔒 Not logged in");
  }

  if (session?.storedAt) {
    const storedAt = new Date(session.storedAt);
    if (!Number.isNaN(storedAt.valueOf())) {
      console.log(`🗄️  Session saved: ${storedAt.toLocaleString()}`);
    }
  }

  console.log(`🌐 API base: ${APP_BASE_URL}`);
}

function renderCommandMenu(commands: CommandDefinition[]) {
  console.log("\nAvailable commands:");
  const nameWidth = commands.reduce(
    (max, command) => Math.max(max, command.name.length),
    0,
  );

  for (const command of commands) {
    const padded = command.name.padEnd(nameWidth, " ");
    console.log(`  ${padded}  ${command.description}`);
  }
}

function showHelp(
  session: SessionRecord | null,
  commands: CommandDefinition[],
) {
  renderStatus(session);
  renderCommandMenu(commands);
}

export { printWelcomeMessage, renderCommandMenu, renderStatus, showHelp };

