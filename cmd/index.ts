import "dotenv/config";
import process from "node:process";
import { input } from "@inquirer/prompts";
import { COMMAND_LOOKUP, visibleCommands } from "./commands.js";
import { isPromptAbortError, readSessionFile } from "./core.js";
import { printWelcomeMessage } from "./lib.js";

async function main() {
  printWelcomeMessage();

  let exit = false;
  let cancelled = false;

  while (!exit) {
    try {
      const sessionRecord = await readSessionFile();
      const commands = visibleCommands(sessionRecord);
      const availableNames = commands.map((command) => command.name);

      const choice = (
        await input({
          message: "Enter a command (type /help for options):",
          validate: (value) => {
            if (!value?.trim()) {
              return "Command is required.";
            }
            const normalized = value.trim();
            if (!availableNames.includes(normalized)) {
              return `Unknown command. Expected one of: ${availableNames.join(", ")}`;
            }
            return true;
          },
        })
      ).trim();

      const command = COMMAND_LOOKUP.get(choice);
      if (!command) {
        console.log("⚠️  Command not recognized. Try again.");
        continue;
      }

      const result = await command.handler({ session: sessionRecord });
      if (result?.exit) {
        exit = true;
      }
    } catch (error) {
      if (isPromptAbortError(error)) {
        cancelled = true;
        break;
      }
      throw error;
    }
  }

  if (cancelled) {
    console.log("\n👋 Cancelled by user. Exiting.");
  } else {
    console.log("👋 Goodbye!");
  }
  process.exit(0);
}

void main().catch((error) => {
  if (isPromptAbortError(error)) {
    console.log("\n👋 Cancelled by user. Exiting.");
    return;
  }
  console.error("❌ Unexpected error:", error);
  process.exitCode = 1;
});
