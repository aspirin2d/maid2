import "dotenv/config";
import process from "node:process";
import { search } from "@inquirer/prompts";
import {
  availableCommandInputs,
  resolveCommandInput,
  runCommand,
  visibleCommands,
} from "./commands.js";
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
      const availableInputs = availableCommandInputs(commands);

      const choice = await search({
        message: "Enter a command:",
        source: async (term) => {
          // If no search term, show all available commands
          if (!term) {
            return availableInputs.map((cmd) => ({
              name: cmd,
              value: cmd,
            }));
          }

          // Filter commands based on search term
          const normalizedTerm = term.toLowerCase();
          const filtered = availableInputs.filter((cmd) =>
            cmd.toLowerCase().includes(normalizedTerm)
          );

          return filtered.map((cmd) => ({
            name: cmd,
            value: cmd,
          }));
        },
        validate: (value) => {
          if (!value?.trim()) {
            return "Command is required.";
          }
          const normalized = value.trim();
          if (!resolveCommandInput(normalized, commands)) {
            return `Unknown command. Expected one of: ${availableInputs.join(", ")}`;
          }
          return true;
        },
      });

      const result = await runCommand(choice, sessionRecord);
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
    console.log("\nCancelled by user. Exiting.");
  } else {
    console.log("Goodbye!");
  }
  process.exit(0);
}

void main().catch((error) => {
  if (isPromptAbortError(error)) {
    console.log("\nCancelled by user. Exiting.");
    return;
  }
  console.error("Unexpected error:", error);
  process.exitCode = 1;
});
