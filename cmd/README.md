# Maid 2 CLI Commands

The interactive CLI helps you manage stories and memories without leaving the terminal. It shares authentication with the Hono API by reading the persisted session created during login.

## Running the CLI
```bash
pnpm tsx cmd/index.ts
```

When prompted, enter one of the commands below. Commands are case-sensitive and must include the leading slash. You can also append a subcommand (for example, `/story list`) to jump directly to a specific action.

## Available Commands
- `/help` – Print the command list, showing only options available in the current session state.
- `/login` – Sign in with email and password through Better Auth and persist the returned session.
- `/signup` – Create a new account and store the resulting session locally.
- `/story` – Manage stories. Supports subcommands like `list`, `create`, `chat`, `rename`, `delete`, `clear`, and `handlers`.
- `/memory` – Manage memories. Supports subcommands like `list`, `view`, `create`, `edit`, `delete`, and `extract`.
- `/logout` – Clear the locally stored session and invalidate it with the API.
- `/exit` – Close the CLI loop.

The CLI stores its session state under `.session` in the project root. Delete this file to force re-authentication if needed.

## Story Subcommands

| Command | Description |
| --- | --- |
| `/story list` | Print a summary of all stories. |
| `/story create` | Launch the interactive story creation flow. |
| `/story chat <id>` | Open chat mode for the selected story. |
| `/story rename <id> [new name]` | Rename a story (prompts if the name is omitted). |
| `/story delete <id>` | Delete a story after confirmation. |
| `/story clear <id>` | Clear all messages associated with a story. |
| `/story handlers [id]` | List available handlers (optionally for a specific story). |

## Memory Subcommands

| Command | Description |
| --- | --- |
| `/memory list` | Print a summary of stored memories. |
| `/memory view <id>` | Show the full details of a memory. |
| `/memory create` | Launch the interactive memory creation flow. |
| `/memory edit <id>` | Edit an existing memory. |
| `/memory delete <id>` | Delete a memory after confirmation. |
| `/memory extract` | Trigger extraction of memories from recent messages. |
