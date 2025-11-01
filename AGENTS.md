# Repository Guidelines

## Project Structure & Module Organization
Application code lives in `src/`: `src/index.ts` wires the Hono HTTP server, `src/auth.ts` encapsulates Better Auth, and `src/db.ts` exposes the Drizzle-powered Postgres client. Schema definitions stay under `src/schema/` and should be the single source of truth for migrations. Use `examples/` for runnable snippets that help other agents test flows. The `pg/` directory holds the local pgvector volume mounted by `compose.yml`; keep it out of commits unless you intentionally update seed SQL. Migration tooling is configured via `drizzle.config.ts`, which points Drizzle Kit to the schema and `./drizzle` output folder.

## Build, Test, and Development Commands
Install dependencies with `pnpm install` (preferred because of the existing lockfile). `pnpm dev` launches the watch server through `tsx` and requires a populated `.env`. Build production artifacts with `pnpm build`, then serve them using `pnpm start`. When the schema changes, run `pnpm drizzle-kit generate --name <change>` to emit migrations and check them into `drizzle/`.

## Coding Style & Naming Conventions
Write modern TypeScript with 2-space indentation and ES module syntax, mirroring the current files. Keep filenames lowercase with optional dashes (`schema/db.ts`, `auth.ts`), and export singletons (such as the `auth` instance or `pool`) from dedicated modules to avoid re-instantiation. Rely on TypeScript’s compiler for linting; run `pnpm dev` or `pnpm build` locally to surface type errors before opening a PR.

## Testing Guidelines
Introduce tests alongside features in `src/__tests__/` using Vitest or an equivalent lightweight runner, and add a `pnpm test` script the moment a suite lands. Name specs `<feature>.spec.ts`, stub Postgres with the Docker service from `compose.yml`, and document any fixtures or seed data in the PR. Aim to cover critical auth and database paths, especially new middleware and schema changes.

## Commit & Pull Request Guidelines
Follow the concise, imperative style already in Git history (e.g., `db init`, `drizzle compose setup`). Group unrelated changes into separate commits. Pull requests should summarize the change set, call out environment variable updates, link relevant issues, and attach screenshots or `curl` transcripts for new routes. Highlight migration files and confirm they were generated with Drizzle Kit before requesting review.

## Environment & Security Notes
Create a `.env` with `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `PORT`, and `BETTER_AUTH_URL`; share sample values via LastPass or 1Password, not Git. Launch Postgres with `docker compose up db` to use the pgvector image specified in `compose.yml`. Never commit secrets or the contents of `pg/data`, and rotate tokens if the local database is dumped or shared.
