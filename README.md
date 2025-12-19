# Guided PR Reviewer

A standalone web app that ingests GitHub PRs, breaks them into guided "review steps" (change units), shows just-in-time context per step, and lets you draft and publish GitHub review comments.

## Features

- **GitHub App Integration**: Secure authentication and granular repository access.
- **Guided Review Steps**: Automatically clusters PR diffs into logical change units.
- **AI Guidance**: Structured analysis of changes, risks, and review checklists (powered by OpenRouter/Claude).
- **Immediate Publishing**: Publish inline and conversation comments directly to GitHub.
- **Review Wrap-up**: Finalize your review with a top-level summary and bulk status update (Approve/Request Changes).

## Prerequisites

- [Node.js](https://nodejs.org/) (v20+)
- [pnpm](https://pnpm.io/)
- [Docker](https://www.docker.com/) & Docker Compose
- [Redis](https://redis.io/) (for local dev without Docker)

## Setup Instructions

### 1. GitHub App Configuration

1.  Go to your GitHub [Developer Settings](https://github.com/settings/apps) and create a **New GitHub App**.
2.  **Callback URL**: `http://localhost:3000/auth/github/callback`
3.  **Webhook URL**: `http://localhost:3000/api/webhooks/github` (and provide a secret).
4.  **Permissions**:
    - **Pull requests**: Read & write
    - **Issues**: Read & write
    - **Contents**: Read-only
    - **Metadata**: Read-only (default)
5.  **Events**: Subscribe to **Pull request** and **Installation**.
6.  **Private Key**: Generate and download a private key.

### 2. Environment Variables

Create a `.env` file in the root directory and populate it:

```bash
# App Config
APP_BASE_URL=http://localhost:3000
PORT=3000

# GitHub App Config
GITHUB_APP_ID=your_app_id
GITHUB_APP_NAME=your_app_slug
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
GITHUB_WEBHOOK_SECRET=your_webhook_secret
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
...
-----END RSA PRIVATE KEY-----"

# Database (SQLite)
DATABASE_URL=data/pr-reviewer.db

# Redis
REDIS_URL=redis://localhost:6379

# LLM (OpenRouter)
LLM_API_KEY=your_openrouter_api_key
LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_MODEL=anthropic/claude-3.5-sonnet
```

### 3. Installation

```bash
pnpm install
```

## Running the App

### Using Docker (Recommended)

This starts the web app, the background worker, and a Redis instance:

```bash
docker-compose up --build
```

### Local Development

1.  **Start Redis**: Ensure Redis is running on `localhost:6379`.
2.  **Run Migrations**:
    ```bash
    pnpm drizzle-kit push
    ```
3.  **Start Web App**:
    ```bash
    pnpm dev
    ```
4.  **Start Background Worker**:
    ```bash
    pnpm run worker
    ```

## Usage

1.  Sign in with your GitHub account.
2.  Install the app on your repositories.
3.  Choose a repository and an open Pull Request.
4.  Follow the guided steps to review changes, add notes, and publish comments.
5.  Submit your final review in the "Wrap-up" section.
