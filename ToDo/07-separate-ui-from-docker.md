# Plan: Separate UI from Docker Container

## Overview

Restructure the deployment architecture so the UI (SvelteKit frontend) runs outside the Docker container but connects to the backend services running in Docker.

## Current State

- Single `web.Dockerfile` that builds and serves the entire SvelteKit app
- `docker-compose.yml` runs web, worker, and database services
- UI and API are tightly coupled in the same container
- Development requires rebuilding Docker image for UI changes

## Benefits of Separation

1. **Faster development** - UI hot reload works without Docker rebuilds
2. **Independent scaling** - Scale API/worker separately from UI serving
3. **Simpler deployments** - UI can be deployed to CDN/Vercel while API stays in Docker
4. **Better local development** - Run UI locally, backend in Docker

## Implementation Steps

### 1. Update Docker Compose Structure

```yaml
# docker-compose.yml
services:
  # API server (backend only)
  api:
    build:
      context: .
      dockerfile: docker/api.Dockerfile
    ports:
      - '3001:3001'
    environment:
      - DATABASE_URL=file:/data/pr-reviewer.db
      - NODE_ENV=production
    volumes:
      - ./data:/data
    depends_on:
      - migrate

  # Background worker
  worker:
    build:
      context: .
      dockerfile: docker/worker.Dockerfile
    environment:
      - DATABASE_URL=file:/data/pr-reviewer.db
    volumes:
      - ./data:/data
    depends_on:
      - migrate

  # Database migration
  migrate:
    build:
      context: .
      dockerfile: docker/migrate.Dockerfile
    volumes:
      - ./data:/data

  # Optional: UI for production (can be removed for Vercel deployment)
  ui:
    build:
      context: .
      dockerfile: docker/ui.Dockerfile
    ports:
      - '3000:3000'
    environment:
      - API_URL=http://api:3001
    depends_on:
      - api
```

### 2. Create Separate API Server

Create `src/api-server.ts`:

```typescript
import { handler } from './build/handler.js';
import express from 'express';
import cors from 'cors';

const app = express();

// Enable CORS for UI running on different origin
app.use(
	cors({
		origin: process.env.UI_ORIGIN || 'http://localhost:5173',
		credentials: true
	})
);

// Mount SvelteKit handler (API routes only)
app.use(handler);

app.listen(3001, () => {
	console.log('API server running on port 3001');
});
```

### 3. Update API Routes

Ensure all API routes work independently:

```typescript
// src/routes/api/+server.ts
export async function GET() {
	return new Response(JSON.stringify({ status: 'ok' }), {
		headers: { 'Content-Type': 'application/json' }
	});
}
```

### 4. Create API Dockerfile

Create `docker/api.Dockerfile`:

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules

ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "build/index.js"]
```

### 5. Update UI to Use External API

Create `src/lib/config.ts`:

```typescript
export const API_BASE_URL =
	import.meta.env.VITE_API_URL || (typeof window !== 'undefined' ? '' : 'http://api:3001');
```

Update API calls in components:

```typescript
import { API_BASE_URL } from '$lib/config';

const response = await fetch(`${API_BASE_URL}/api/steps/${stepId}/notes`, {
	method: 'POST',
	credentials: 'include' // For cookies/auth
	// ...
});
```

### 6. Handle Authentication Across Origins

Update session handling for cross-origin:

```typescript
// src/lib/server/auth/session.ts
export function createSessionCookie(sessionId: string) {
	return {
		name: 'session',
		value: sessionId,
		options: {
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'lax' as const,
			domain: process.env.COOKIE_DOMAIN || undefined,
			path: '/'
		}
	};
}
```

### 7. Create Development Script

Add to `package.json`:

```json
{
	"scripts": {
		"dev": "vite dev",
		"dev:docker": "docker-compose up api worker -d && vite dev",
		"docker:api": "docker-compose up api worker",
		"docker:all": "docker-compose up"
	}
}
```

### 8. Update Environment Variables

```env
# .env.development
VITE_API_URL=http://localhost:3001
DATABASE_URL=file:./data/pr-reviewer.db

# .env.production
VITE_API_URL=https://api.your-domain.com
```

### 9. Add Proxy for Development (Optional)

Update `vite.config.ts`:

```typescript
export default defineConfig({
	// ...
	server: {
		proxy: {
			'/api': {
				target: 'http://localhost:3001',
				changeOrigin: true
			}
		}
	}
});
```

### 10. Update Documentation

Update `README.md` with new deployment options:

````markdown
## Development

### Option 1: Full local development

```bash
pnpm dev
```
````

### Option 2: UI local, backend in Docker

```bash
docker-compose up api worker -d
pnpm dev
```

### Option 3: Everything in Docker

```bash
docker-compose up
```

## Production Deployment

### Option A: Deploy UI to Vercel, API to Docker

1. Deploy API: `docker-compose up api worker`
2. Set `VITE_API_URL` in Vercel

### Option B: Everything in Docker

```bash
docker-compose up
```

```

## Files to Create/Modify
- `docker/api.Dockerfile` (new)
- `docker/ui.Dockerfile` (new, optional)
- `docker-compose.yml` (restructure)
- `src/lib/config.ts` (new)
- `vite.config.ts` (add proxy)
- `package.json` (update scripts)
- `README.md` (update docs)
- Various API call sites throughout the codebase

## Testing
- Test local development with Docker backend
- Test full Docker deployment
- Test cross-origin authentication
- Test webhook handling (GitHub needs to reach API)
- Test file uploads if any

## Migration Considerations
- Existing deployments will need reconfiguration
- Database location remains the same
- Environment variables need updating

## Dependencies
- None - infrastructure change
```
