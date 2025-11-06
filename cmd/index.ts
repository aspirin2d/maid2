import "dotenv/config";
import process from "node:process";
import {
  runCommand,
  visibleCommands,
} from "./commands.js";
import { isPromptAbortError, readSessionFile, mainMenuPrompt } from "./core.js";
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
        let shortcut: string | undefined;

        // Add keyboard shortcut hints and shortcuts
        if (command.name === "/login") {
          name = "[l] Login - " + command.description;
          shortcut = "l";
        } else if (command.name === "/logout") {
          name = "[l] Logout - " + command.description;
          shortcut = "l";
        } else if (command.name === "/signup") {
          name = "[s] Signup - " + command.description;
          shortcut = "s";
        } else if (command.name === "/story") {
          name = "[s] Story - " + command.description;
          shortcut = "s";
        } else if (command.name === "/memory") {
          name = "[m] Memory - " + command.description;
          shortcut = "m";
        } else if (command.name === "/admin") {
          name = "[a] Admin - " + command.description;
          shortcut = "a";
        } else if (command.name === "/exit") {
          name = "[q] Quit - " + command.description;
          shortcut = "q";
        }

        return {
          name,
          value: command.name,
          shortcut,
        };
      });

      const choice = await mainMenuPrompt({
        message: "Select a command:",
        choices,
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
