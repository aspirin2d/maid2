import "dotenv/config";
import process from "node:process";
import { input } from "@inquirer/prompts";
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

      const choice = (
        await input({
          message: "Enter a command (type /help for options):",
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
        })
      ).trim();

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
