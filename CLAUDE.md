# CLAUDE.md - Development Context Guide

## Project Overview

**maid2** is a conversational AI application with memory extraction capabilities. It's built as a TypeScript web service with both an HTTP API (via Hono) and a CLI interface (via Inquirer prompts). The app manages chat "stories" (conversations), extracts structured memories from conversations using LLMs, and stores them with vector embeddings for semantic search.

### Core Capabilities
- **Story Management**: Create and manage chat conversations between users and AI
- **Memory Extraction**: Automatically extract structured memories (user info, preferences, goals, events) from conversations
- **Vector Search**: Store memories with embeddings (pgvector) for semantic retrieval
- **Multi-LLM Support**: Works with both OpenAI and Ollama providers
- **Authentication**: Better Auth integration for user management
- **CLI Interface**: Interactive command-line tool for managing stories and memories

## Architecture

### Tech Stack
- **Runtime**: Node.js with TypeScript (ES modules)
- **Web Framework**: Hono (lightweight, Express-like)
- **Database**: PostgreSQL with pgvector extension
- **ORM**: Drizzle ORM
- **Auth**: Better Auth
- **LLM Integration**: OpenAI SDK, Ollama SDK
- **CLI**: Inquirer prompts
- **Development**: tsx (TypeScript execution), Docker Compose

### Key Patterns
1. **Singleton exports**: Core services (db, auth, pool) are exported as singletons from dedicated modules
2. **Middleware chain**: Auth middleware sets `user` and `session` on Hono context
3. **Handler pattern**: Routes use a consistent handler pattern (see `src/middlewares/handler.ts`)
4. **Streaming responses**: LLM responses stream to client using Server-Sent Events
5. **Memory extraction**: Background process extracts memories from unextracted messages

## Directory Structure

```
maid2/
├── src/                    # Main application code
│   ├── index.ts           # Hono server entry point
│   ├── auth.ts            # Better Auth configuration
│   ├── db.ts              # Drizzle DB client & connection pool
│   ├── env.ts             # Environment variable validation
│   ├── types.ts           # Core type definitions
│   ├── llm.ts             # LLM provider abstraction
│   ├── schemas/
│   │   └── db.ts          # Drizzle schema (users, stories, messages, memories)
│   ├── routes/            # HTTP route handlers
│   │   ├── index.ts       # Route registration
│   │   ├── story.ts       # Story CRUD operations
│   │   ├── message.ts     # Message operations & streaming chat
│   │   └── memory.ts      # Memory CRUD & extraction
│   ├── middlewares/       # Hono middleware
│   │   ├── auth.ts        # Session resolution
│   │   ├── params.ts      # Route param validation
│   │   └── handler.ts     # Standard error handling
│   ├── handlers/          # Business logic handlers
│   ├── prompts/           # LLM prompts (extraction, etc.)
│   ├── story.ts           # Story service functions
│   ├── memory.ts          # Memory service functions
│   ├── message.ts         # Message service functions
│   ├── extraction.ts      # Memory extraction logic
│   └── streaming.ts       # SSE streaming utilities
├── cmd/                   # CLI application
│   ├── index.ts          # CLI entry point
│   ├── core.ts           # Core CLI utilities
│   ├── commands.ts       # Command definitions
│   ├── auth.ts           # CLI authentication
│   ├── stories.ts        # Story management CLI
│   ├── memories.ts       # Memory management CLI
│   └── lib.ts            # Shared CLI utilities
├── shared-types.ts        # Types shared between src/ and cmd/
├── drizzle.config.ts      # Drizzle Kit configuration
├── compose.yml            # Docker Compose (postgres + pgvector)
└── pg/                    # PostgreSQL data volume (gitignored)
```

## Data Model

### Core Entities

**user** (Better Auth standard)
- id, name, email, emailVerified, image
- createdAt, updatedAt

**session** (Better Auth standard)
- id, token, expiresAt, userId
- ipAddress, userAgent

**account** (Better Auth standard)
- OAuth provider accounts linked to users

**story** (Conversation thread)
- id, userId, name
- provider: "openai" | "ollama"
- handler: defaults to "simple"
- createdAt, updatedAt

**message** (Individual chat message)
- id, storyId
- role: "system" | "user" | "assistant"
- content: message text
- extracted: boolean flag (whether memories have been extracted)
- createdAt, updatedAt

**memory** (Extracted knowledge)
- id, userId
- content: current memory content
- prevContent: previous version (for updates)
- category: "USER_INFO" | "USER_PREFERENCE" | "USER_GOAL" | "USER_RELATIONSHIP" | "EVENT" | "OTHER"
- importance: 0-1 scale
- confidence: 0-1 scale
- action: "ADD" | "UPDATE" | "DELETE"
- embedding: vector(1536) - for semantic search
- createdAt, updatedAt

### Indexes
- Story: userId index
- Message: storyId, extracted, composite(storyId + extracted)
- Memory: userId, HNSW vector index on embedding

## Key Files Deep Dive

### src/index.ts
Entry point for the HTTP server. Sets up Hono app, mounts Better Auth at `/api/auth/*`, adds session middleware that populates `c.get('user')` and `c.get('session')`, registers routes, and starts the server.

### src/db.ts
Exports the Drizzle client (default export) and pg Pool. Single source of truth for database connections.

### src/schemas/db.ts
**IMPORTANT**: This is the single source of truth for the database schema. All migrations should be generated from this file using `pnpm drizzle-kit generate`.

### src/llm.ts
LLM provider abstraction. Exports `createLLM()` function that returns either OpenAI or Ollama client based on provider string.

### src/extraction.ts
Core memory extraction logic. Reads unextracted messages, sends to LLM with extraction prompt, parses structured response, creates/updates/deletes memories with embeddings.

### src/streaming.ts
SSE (Server-Sent Events) utilities for streaming LLM responses to clients.

### cmd/index.ts
CLI entry point. Uses Inquirer for interactive menus to manage stories and memories from the terminal.

## Development Workflow

### Setup
```bash
# Install dependencies (prefer pnpm due to lockfile)
pnpm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your values

# Start PostgreSQL with pgvector
docker compose up -d db

# Generate and run migrations
pnpm drizzle-kit generate --name initial
pnpm drizzle-kit migrate

# Start dev server
pnpm dev
```

### Common Commands
```bash
pnpm dev              # Watch mode development server
pnpm build            # Build for production
pnpm start            # Run production build
pnpm drizzle-kit generate --name <change>  # Generate migration
pnpm drizzle-kit migrate                   # Apply migrations
pnpm drizzle-kit studio                    # Open Drizzle Studio UI
```

### Schema Changes Workflow
1. Modify `src/schemas/db.ts`
2. Generate migration: `pnpm drizzle-kit generate --name descriptive_name`
3. Review generated SQL in `drizzle/` directory
4. Apply migration: `pnpm drizzle-kit migrate`
5. Commit both schema changes and migration files

## Coding Conventions

### Style
- 2-space indentation
- ES module syntax (`import`/`export`)
- Lowercase filenames with dashes (`message-handler.ts`)
- Modern TypeScript features (no `var`, use `const`/`let`)

### Imports
Always use `.js` extension in imports, even for `.ts` files (required for ES modules):
```typescript
import { auth } from "./auth.js";  // ✓ Correct
import { auth } from "./auth";     // ✗ Wrong
```

### Singleton Pattern
```typescript
// db.ts
export const pool = new Pool({ ... });
const db = drizzle({ client: pool });
export default db;

// Usage elsewhere
import db from "./db.js";  // Always get same instance
```

### Error Handling
Use the handler middleware pattern for routes:
```typescript
import { createHandler } from "../middlewares/handler.js";

export const getStory = createHandler(async (c) => {
  // Logic here - errors are caught and formatted by middleware
  return c.json({ data: story });
});
```

## Common Tasks & Patterns

### Adding a New Route
1. Create handler in `src/routes/<domain>.ts`
2. Use `createHandler()` wrapper for error handling
3. Register in `src/routes/index.ts`
4. Add authentication middleware if needed

### Adding a New Table
1. Define schema in `src/schemas/db.ts`
2. Export the table
3. Generate migration: `pnpm drizzle-kit generate --name add_table_name`
4. Review and apply migration
5. Create service functions in `src/<table-name>.ts`

### Memory Extraction Flow
1. User sends message → saved with `extracted: false`
2. Assistant responds → saved with `extracted: false`
3. Extraction service reads messages where `extracted: false`
4. LLM analyzes conversation context with extraction prompt
5. Structured memories returned (ADD/UPDATE/DELETE actions)
6. Memories saved to DB with embeddings
7. Messages marked `extracted: true`

### Streaming LLM Responses
```typescript
import { streamSSE } from "../streaming.js";

export const chat = createHandler(async (c) => {
  const stream = await llm.chat.completions.create({
    messages: [...],
    stream: true,
  });

  return streamSSE(c, stream);
});
```

### Vector Search for Memories
```typescript
import { sql } from "drizzle-orm";
import db from "./db.js";
import { memory } from "./schemas/db.js";

const results = await db
  .select()
  .from(memory)
  .where(sql`${memory.embedding} <=> ${userQueryEmbedding}`)
  .orderBy(sql`${memory.embedding} <=> ${userQueryEmbedding}`)
  .limit(10);
```

## Environment Variables

Required:
- `PORT`: Server port (default 3000)
- `BETTER_AUTH_URL`: Auth callback URL
- `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, `DB_NAME`: Postgres connection

Optional:
- `OPENAI_API_KEY`: Required if using OpenAI provider
- `OLLAMA_BASE_URL`: Ollama endpoint (default: http://localhost:11434)
- `OLLAMA_KEEP_ALIVE`: Model keep-alive duration (default: 24h)

**NEVER commit `.env` or expose secrets in code/logs**

## Important Gotchas

### 1. Import Extensions
Always use `.js` extensions in imports for ES modules, even though files are `.ts`

### 2. Schema is Source of Truth
`src/schemas/db.ts` is the single source of truth. Never manually edit migration SQL unless absolutely necessary.

### 3. PostgreSQL with pgvector Required
The app requires pgvector extension for vector embeddings. Use the Docker Compose setup.

### 4. Message Extraction State
Messages have an `extracted` boolean flag. Don't forget to set it to `true` after extraction to avoid re-processing.

### 5. Memory Actions
Memories use action field ("ADD", "UPDATE", "DELETE") to track lifecycle. The extraction prompt guides the LLM to specify the appropriate action.

### 6. Singleton Database Client
Always import `db` from `./db.js` - never create new Drizzle instances.

### 7. Type Safety
Use Drizzle's inferred types. For schema tables:
```typescript
import type { InferSelectModel } from "drizzle-orm";
import { story } from "./schemas/db.js";

type Story = InferSelectModel<typeof story>;
```

### 8. Shared Types
Use `shared-types.ts` for types that need to be shared between `src/` and `cmd/` directories. This prevents circular dependencies.

## Testing Notes

Currently no test suite exists. When adding tests:
- Place in `src/__tests__/` directory
- Use Vitest or similar lightweight runner
- Name files `<feature>.spec.ts`
- Add `pnpm test` script to package.json
- Use Docker Compose DB for test fixtures
- Focus on critical paths: auth, extraction, vector search

## Commit Guidelines

Follow concise, imperative style:
- `feat: add story pagination`
- `fix: handle null embeddings`
- `refactor: extract memory service`
- `db: add memory category index`

Group related changes in single commits. Separate unrelated changes.

## CLI Usage

The CLI provides an interactive interface:
```bash
npm run dev  # In cmd/ directory or use tsx cmd/index.ts
```

Features:
- `/login`: Authenticate with email/password
- `/story`: List, create, chat with stories
- `/memory`: View and manage extracted memories
- Interactive menus with keyboard navigation

## Future Considerations

- Add test coverage (especially extraction logic)
- Implement memory deduplication
- Add memory importance decay over time
- Implement memory search API endpoint
- Add conversation summarization
- Support for multi-user conversations
- Memory versioning and history

## Quick Reference

### Most Common Files to Edit
- `src/schemas/db.ts` - Database schema
- `src/routes/*.ts` - API endpoints
- `src/extraction.ts` - Memory extraction logic
- `src/prompts/extraction.ts` - LLM prompts
- `cmd/*.ts` - CLI interface

### Most Common Operations
- Add table: Edit schema → generate migration → apply
- Add route: Create handler → register in routes/index.ts
- Modify extraction: Edit prompts/extraction.ts
- Test locally: `docker compose up -d` → `pnpm dev`

---

**Last Updated**: 2025-11-03
**Version**: 1.0
