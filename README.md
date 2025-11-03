# Maid 2

Maid 2 is a Hono-based HTTP API and companion CLI for managing interactive AI “stories” and long-term memories. It combines Better Auth for authentication, Drizzle ORM with Postgres/pgvector for persistence, and optional LLM integrations via OpenAI or Ollama.

## Features
- Hono HTTP server with typed request context and middleware for session-aware routing.
- Better Auth integration (email/password) backed by Drizzle + Postgres.
- Story, message, and memory APIs with handler-specific streaming support.
- Configurable LLM backends (OpenAI, Ollama) for text generation and embeddings.
- Interactive CLI (`cmd/`) to browse stories and memories from the terminal.

## Prerequisites
- Node.js 20+
- pnpm 9+ (preferred) or npm
- Docker (for the Postgres service defined in `compose.yml`)
- Access credentials for your Better Auth deployment and database

## Environment
Create a `.env` file in the project root. All variables are validated on startup via Zod:

| Variable | Description |
|----------|-------------|
| `PORT` | HTTP port for the Hono server (e.g. `3000`) |
| `BETTER_AUTH_URL` | Base URL of your Better Auth instance |
| `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, `DB_NAME` | Postgres connection settings |
| `OPENAI_API_KEY` | (Optional) OpenAI API key when using OpenAI handlers |
| `OPENAI_MODEL`, `OPENAI_EMBEDDING_MODEL` | (Optional) Override default OpenAI models |
| `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `OLLAMA_EMBEDDING_MODEL`, `OLLAMA_KEEP_ALIVE` | (Optional) Ollama connection details |

Launch the local database with:
```bash
docker compose up db
```

## Installation
```bash
pnpm install
```

## Development Workflow
- **Start the API:** `pnpm dev` – reloads on changes via `tsx`.
- **Build for production:** `pnpm build`
- **Run the compiled server:** `pnpm start`

The server listens on `http://localhost:<PORT>` (default `3000`) and exposes REST endpoints under `/api/…`.

## API Overview
All application endpoints require an authenticated Better Auth session. The Hono server reads the Better Auth session cookie or bearer token from the incoming request headers and attaches the user to the request context. Unauthenticated calls return `401 Unauthorized`.

### Authentication
- `ALL /api/auth/*` – proxied directly to Better Auth’s handler. Use the Better Auth SDK or REST calls here to sign up, sign in, or refresh sessions.

### Stories (`/api/s`)
- `GET /` – List stories for the signed-in user.
- `GET /handlers` – List every registered story handler with metadata and JSON Schemas.
- `GET /:id` – Fetch a single story by numeric ID.
- `GET /:id/handlers` – Handler metadata scoped to the given story.
- `POST /` – Create a story. Body: `{ name, provider?, handler? }`. Defaults to handler `simple`, provider `openai`.
- `PATCH /:id` – Update story name, provider, or handler.
- `DELETE /:id` – Remove a story you own.
- `DELETE /:id/messages` – Delete all messages tied to the story.
- `POST /:id/stream` – SSE endpoint that streams handler output. Emits `start`, `thinking`, `delta`, and `finish` events. Request body accepts `{ prompt | question | message | input | ... }` depending on the handler contract.

### Messages (`/api/m`)
- `GET /` – List messages for the current user. Query params:
  - `story=<id>` (optional) limits to a specific story.
  - `extracted=0|1` filters by whether the message has been mined for memories.

### Memories (`/api/mem`)
- `GET /` – List memories for the current user.
- `POST /` – Create a memory. Body: `{ content, category?, importance?, confidence?, provider? }`. Provider defaults to `openai`.
- `PUT /:id` – Update memory metadata or content (recomputes embeddings when content changes).
- `DELETE /:id` – Remove a memory you own.
- `POST /extract` – Run automatic extraction against unprocessed messages. Body optionally includes `{ provider }`.

## CLI Companion
The terminal client lives under `cmd/` and shares authentication with the API.

Run it with:
```bash
pnpm tsx cmd/index.ts
```

From there you can `/login`, `/story`, `/memory`, and `/logout`. See `cmds/README.md` for command details.

## Database & Migrations
- Schema definitions live in `src/schemas/`.
- Generate migrations after schema changes:
  ```bash
  pnpm drizzle-kit generate --name add-new-table
  ```
- Apply migrations using your preferred workflow (e.g. `pnpm drizzle-kit push` or external tooling).
- Migration files are written to `./drizzle/`.

## Testing
When introducing automated tests, place them in `src/__tests__/` using Vitest (or a similarly lightweight runner) and wire a `pnpm test` script in `package.json`.

## File Structure Highlights
- `src/index.ts` – Hono server bootstrap and route registration.
- `src/auth.ts` – Better Auth configuration with Drizzle adapter.
- `src/db.ts` – Postgres pool + Drizzle client singleton.
- `src/routes/` – Story, memory, and message HTTP routes.
- `src/middlewares/` – Authentication, handler validation, and parameter parsing.
- `cmd/` – Interactive CLI entry point and command definitions.
- `drizzle.config.ts` – Drizzle Kit configuration for migrations.

## Troubleshooting
- **Environment validation fails:** check the console output, which lists missing/invalid variables before exit.
- **Authentication issues:** ensure the API can reach `BETTER_AUTH_URL` and that your Better Auth instance has matching origins.
- **Database connection errors:** confirm the Docker Postgres container is running and credentials match your `.env`.
