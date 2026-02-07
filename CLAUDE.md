# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Guided PR Reviewer - A web app that ingests GitHub PRs, breaks them into guided "review steps" (logical change units), provides AI-powered context and guidance per step, and lets users draft and publish GitHub review comments.

## Development Commands

```bash
# Install dependencies
pnpm install

# Start dev server (requires Redis running)
pnpm dev

# Start background worker (separate terminal)
pnpm worker:dev

# Or use Docker for everything (recommended)
docker-compose up --build

# Type checking
pnpm check

# Linting
pnpm lint

# Format code
pnpm format

# Database operations
pnpm db:push      # Push schema to database
pnpm db:generate  # Generate migrations
pnpm db:migrate   # Run migrations
pnpm db:studio    # Open Drizzle Studio

# Run e2e tests
pnpm test:e2e
```

## Architecture

### Two-Process Architecture
The app runs as two separate processes:
1. **Web Server** (`pnpm dev`) - SvelteKit app handling HTTP requests, auth, and UI
2. **Background Worker** (`pnpm worker:dev` or `src/worker.ts`) - BullMQ worker processing async jobs

### Tech Stack
- **Frontend**: SvelteKit 2, Svelte 5, TailwindCSS 4
- **Database**: SQLite via Drizzle ORM (`src/lib/server/db/schema.ts`)
- **Queue**: BullMQ with Redis for background jobs
- **AI**: OpenAI-compatible client (configured for OpenRouter/Claude)
- **GitHub**: Octokit with GitHub App authentication

### Key Directories

```
src/
├── lib/
│   ├── server/
│   │   ├── ai/          # LLM client configuration
│   │   ├── auth/        # Session management & GitHub OAuth
│   │   ├── db/          # Drizzle schema and database client
│   │   └── jobs/        # Background job handlers
│   └── utils/           # Shared utilities
├── routes/
│   ├── api/             # API endpoints
│   │   ├── webhooks/    # GitHub webhook handler
│   │   ├── sessions/    # Review session APIs
│   │   └── steps/       # Review step APIs (notes, comments, chat)
│   ├── app/             # Protected app routes (requires auth)
│   │   ├── repos/       # Repository listing and selection
│   │   └── sessions/    # Review session UI
│   └── auth/            # GitHub OAuth flow
└── worker.ts            # Background worker entry point
```

### Data Model
The core entities flow: `User` → `Team` → `GithubInstallation` → `Repo` → `PullRequest` → `ReviewSession` → `ReviewStep`

Each `ReviewStep` can have:
- `ContextPack`: Related code context for the step
- `ReviewerNote`: User notes with severity levels
- `DraftComment`: Comments to publish to GitHub
- `StepChatMessage`: Chat history for step-specific AI conversation

### Background Jobs (`src/lib/server/jobs/`)
Jobs are processed by the worker via BullMQ queue `review-tasks`:
- `ingest_pr` - Fetches PR diff and file metadata from GitHub
- `generate_steps` - Clusters changes into logical review steps using AI
- `build_context_pack` - Gathers context for each step
- `generate_ai_guidance` - Generates AI guidance for steps

### Authentication
- GitHub App OAuth for user login
- Session-based auth with cookies (`src/lib/server/auth/session.ts`)
- App.Locals populated via server hooks (`src/hooks.server.ts`)

### Environment Variables
Required in `.env`:
- `GITHUB_APP_ID`, `GITHUB_APP_NAME`, `GITHUB_APP_PRIVATE_KEY`
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_WEBHOOK_SECRET`
- `DATABASE_URL` (SQLite path)
- `REDIS_URL`
- `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`

## Git Conventions

### Commit Messages
Use conventional commits format:
```
<type>: <description>
```
Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Examples:
- `feat: add inline comments on diff view`
- `fix: resolve auth token refresh issue`
- `refactor: extract comment form component`

### Branch & PR Naming
Branch names follow: `<author>/<feature-name>`

Examples:
- `mike/inline-comments-on-diff`
- `mike/fix-auth-flow`

PR titles should match the branch name pattern.
