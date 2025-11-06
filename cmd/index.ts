import "dotenv/config";
import process from "node:process";
import { select } from "@inquirer/prompts";
import {
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

      // Build choices with keyboard shortcuts
      const choices = commands.map((command) => {
        let name = command.description || command.name;

        // Add keyboard shortcut hints
        if (command.name === "/story") {
          name = "[s] Story - " + command.description;
        } else if (command.name === "/memory") {
          name = "[m] Memory - " + command.description;
        } else if (command.name === "/admin") {
          name = "[a] Admin - " + command.description;
        } else if (command.name === "/exit") {
          name = "[q] Quit - " + command.description;
        }

        return {
          name,
          value: command.name,
        };
      });

      const choice = await select({
        message: "Select a command:",
        choices,
        pageSize: 10,
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
