# Maid 2 CLI Commands

The interactive CLI helps you manage stories and memories without leaving the terminal. It shares authentication with the Hono API by reading the persisted session created during login.

## Running the CLI
```bash
pnpm tsx cmd/index.ts
```

When prompted, enter one of the commands below. Commands are case-sensitive and must include the leading slash.

## Available Commands
- `/help` – Print the command list, showing only options available in the current session state.
- `/login` – Sign in with email and password through Better Auth and persist the returned session.
- `/signup` – Create a new account and store the resulting session locally.
- `/story` – List your stories, drill into details, and perform update or delete actions.
- `/memory` – Browse, create, edit, or delete saved memories.
- `/logout` – Clear the locally stored session and invalidate it with the API.
- `/exit` – Close the CLI loop.

The CLI stores its session state under `.session` in the project root. Delete this file to force re-authentication if needed.
