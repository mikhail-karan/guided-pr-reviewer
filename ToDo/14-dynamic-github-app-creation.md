# Plan: Dynamic GitHub App Creation

## Overview

Allow users to create a GitHub App for their repository directly through the UI after logging in, without requiring manual `.env` configuration of GitHub App credentials.

## Current State

- GitHub App credentials must be manually configured in `.env`
- Required variables: `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
- Users must manually create a GitHub App in GitHub settings
- Not user-friendly for self-hosted deployments

## GitHub API Capabilities

### Option 1: GitHub App Manifest Flow

GitHub supports creating apps via a manifest URL flow:

- User visits a URL that triggers app creation
- GitHub shows app creation form pre-filled with manifest
- After creation, GitHub redirects back with temporary code
- Exchange code for app credentials

**Pros:** Official GitHub-supported method
**Cons:** Requires server to handle redirect and store credentials securely

### Option 2: OAuth App (Simpler)

Use a simpler OAuth App instead of GitHub App:

- Less setup required
- Can use OAuth flow directly
- Limited compared to GitHub App (no webhooks, etc.)

**Recommendation:** Option 1 (GitHub App Manifest) for full functionality

## Implementation Steps

### 1. Create App Manifest Endpoint

Create `src/routes/api/github-app/manifest/+server.ts`:

```typescript
import { json } from '@sveltejs/kit';

export async function GET({ url }) {
	const baseUrl = url.origin;

	const manifest = {
		name: 'PR Reviewer (Self-Hosted)',
		url: baseUrl,
		hook_attributes: {
			url: `${baseUrl}/api/webhooks/github`
		},
		redirect_url: `${baseUrl}/api/github-app/callback`,
		callback_urls: [`${baseUrl}/auth/github/callback`],
		setup_url: `${baseUrl}/app/setup`,
		public: false,
		default_permissions: {
			contents: 'read',
			pull_requests: 'write',
			metadata: 'read'
		},
		default_events: ['pull_request', 'pull_request_review', 'pull_request_review_comment']
	};

	return json(manifest);
}
```

### 2. Create Setup Page

Create `src/routes/app/setup/+page.svelte`:

```svelte
<script lang="ts">
	import { onMount } from 'svelte';

	let hasExistingApp = $state(false);
	let isCreating = $state(false);

	onMount(async () => {
		// Check if GitHub App is already configured
		const res = await fetch('/api/github-app/status');
		const data = await res.json();
		hasExistingApp = data.configured;
	});

	function initiateAppCreation() {
		// GitHub App manifest flow
		const manifestUrl = `${window.location.origin}/api/github-app/manifest`;
		const state = crypto.randomUUID();
		sessionStorage.setItem('github_app_state', state);

		// Redirect to GitHub
		window.location.href = `https://github.com/settings/apps/new?manifest=${encodeURIComponent(manifestUrl)}&state=${state}`;
	}
</script>

<div class="mx-auto max-w-2xl p-8">
	<h1 class="mb-6 text-3xl font-bold">Setup GitHub Integration</h1>

	{#if hasExistingApp}
		<div class="mb-8 rounded-lg border border-green-200 bg-green-50 p-6">
			<h2 class="mb-2 text-lg font-semibold text-green-800">GitHub App Configured</h2>
			<p class="text-green-700">Your GitHub App is already set up and ready to use.</p>
		</div>
	{:else}
		<div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
			<h2 class="mb-4 text-lg font-semibold">Create a GitHub App</h2>
			<p class="mb-6 text-gray-600">
				To use PR Reviewer, you need to create a GitHub App for your organization or account. Click
				the button below to create one automatically.
			</p>

			<div class="space-y-4">
				<button
					onclick={initiateAppCreation}
					disabled={isCreating}
					class="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 py-3 font-medium text-white transition hover:bg-gray-800"
				>
					<svg class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
						<!-- GitHub icon -->
					</svg>
					Create GitHub App
				</button>

				<p class="text-center text-xs text-gray-500">
					You'll be redirected to GitHub to complete the setup.
				</p>
			</div>
		</div>

		<div class="mt-8 text-sm text-gray-500">
			<h3 class="mb-2 font-medium text-gray-700">What permissions will be requested?</h3>
			<ul class="list-inside list-disc space-y-1">
				<li>Read repository contents</li>
				<li>Read and write pull requests</li>
				<li>Read repository metadata</li>
			</ul>
		</div>
	{/if}
</div>
```

### 3. Handle GitHub Callback

Create `src/routes/api/github-app/callback/+server.ts`:

```typescript
import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';

export async function GET({ url, cookies }) {
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');

	if (!code) {
		throw redirect(302, '/app/setup?error=missing_code');
	}

	// Exchange code for app credentials
	const response = await fetch(`https://api.github.com/app-manifests/${code}/conversions`, {
		method: 'POST',
		headers: {
			Accept: 'application/vnd.github+json'
		}
	});

	if (!response.ok) {
		throw redirect(302, '/app/setup?error=exchange_failed');
	}

	const appData = await response.json();

	// Store app credentials securely
	await storeGitHubAppCredentials({
		appId: appData.id,
		appSlug: appData.slug,
		clientId: appData.client_id,
		clientSecret: appData.client_secret,
		privateKey: appData.pem,
		webhookSecret: appData.webhook_secret
	});

	throw redirect(302, '/app?setup=complete');
}
```

### 4. Create Secure Credential Storage

Create `src/lib/server/github-app-store.ts`:

```typescript
import { db } from './db';
import * as table from './db/schema';
import { encrypt, decrypt } from './crypto';

interface GitHubAppCredentials {
	appId: string;
	appSlug: string;
	clientId: string;
	clientSecret: string;
	privateKey: string;
	webhookSecret: string;
}

export async function storeGitHubAppCredentials(credentials: GitHubAppCredentials) {
	// Encrypt sensitive values
	const encrypted = {
		...credentials,
		clientSecret: await encrypt(credentials.clientSecret),
		privateKey: await encrypt(credentials.privateKey),
		webhookSecret: await encrypt(credentials.webhookSecret)
	};

	await db
		.insert(table.githubAppConfig)
		.values({
			id: 'default',
			appId: encrypted.appId,
			appSlug: encrypted.appSlug,
			clientId: encrypted.clientId,
			clientSecretEncrypted: encrypted.clientSecret,
			privateKeyEncrypted: encrypted.privateKey,
			webhookSecretEncrypted: encrypted.webhookSecret,
			createdAt: new Date()
		})
		.onConflictDoUpdate({
			target: table.githubAppConfig.id,
			set: encrypted
		});
}

export async function getGitHubAppCredentials(): Promise<GitHubAppCredentials | null> {
	const config = await db.query.githubAppConfig.findFirst();
	if (!config) return null;

	return {
		appId: config.appId,
		appSlug: config.appSlug,
		clientId: config.clientId,
		clientSecret: await decrypt(config.clientSecretEncrypted),
		privateKey: await decrypt(config.privateKeyEncrypted),
		webhookSecret: await decrypt(config.webhookSecretEncrypted)
	};
}
```

### 5. Add Database Schema

Add to `src/lib/server/db/schema.ts`:

```typescript
export const githubAppConfig = sqliteTable('github_app_config', {
	id: text('id').primaryKey().default('default'),
	appId: text('app_id').notNull(),
	appSlug: text('app_slug').notNull(),
	clientId: text('client_id').notNull(),
	clientSecretEncrypted: text('client_secret_encrypted').notNull(),
	privateKeyEncrypted: text('private_key_encrypted').notNull(),
	webhookSecretEncrypted: text('webhook_secret_encrypted').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`)
});
```

### 6. Update Environment Variable Loading

Modify `src/lib/server/env.ts`:

```typescript
import { getGitHubAppCredentials } from './github-app-store';

let cachedCredentials: GitHubAppCredentials | null = null;

export async function getGitHubConfig() {
	// First check environment variables (backward compatible)
	if (process.env.GITHUB_APP_ID && process.env.GITHUB_PRIVATE_KEY) {
		return {
			appId: process.env.GITHUB_APP_ID,
			privateKey: process.env.GITHUB_PRIVATE_KEY,
			clientId: process.env.GITHUB_CLIENT_ID,
			clientSecret: process.env.GITHUB_CLIENT_SECRET,
			webhookSecret: process.env.GITHUB_WEBHOOK_SECRET
		};
	}

	// Fall back to database
	if (!cachedCredentials) {
		cachedCredentials = await getGitHubAppCredentials();
	}

	return cachedCredentials;
}
```

### 7. Update OAuth Flow

Modify `src/routes/auth/github/+server.ts` to use dynamic credentials:

```typescript
import { getGitHubConfig } from '$lib/server/env';

export async function GET({ url }) {
	const config = await getGitHubConfig();

	if (!config) {
		throw redirect(302, '/app/setup');
	}

	const authUrl = new URL('https://github.com/login/oauth/authorize');
	authUrl.searchParams.set('client_id', config.clientId);
	// ... rest of OAuth flow
}
```

### 8. Add Encryption Utilities

Create `src/lib/server/crypto.ts`:

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || randomBytes(32).toString('hex');

export async function encrypt(text: string): Promise<string> {
	const iv = randomBytes(16);
	const cipher = createCipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);

	let encrypted = cipher.update(text, 'utf8', 'hex');
	encrypted += cipher.final('hex');
	const authTag = cipher.getAuthTag();

	return `${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`;
}

export async function decrypt(encrypted: string): Promise<string> {
	const [ivHex, encryptedHex, authTagHex] = encrypted.split(':');

	const decipher = createDecipheriv(
		'aes-256-gcm',
		Buffer.from(ENCRYPTION_KEY, 'hex'),
		Buffer.from(ivHex, 'hex')
	);

	decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

	let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
	decrypted += decipher.final('utf8');

	return decrypted;
}
```

### 9. Add Status Check Endpoint

Create `src/routes/api/github-app/status/+server.ts`:

```typescript
import { json } from '@sveltejs/kit';
import { getGitHubConfig } from '$lib/server/env';

export async function GET() {
	const config = await getGitHubConfig();

	return json({
		configured: !!config,
		appSlug: config?.appSlug || null
	});
}
```

### 10. Update Documentation

Update `README.md`:

```markdown
## Setup

### Option 1: Dynamic GitHub App (Recommended)

1. Run the application
2. Navigate to `/app/setup`
3. Click "Create GitHub App"
4. Follow the GitHub prompts

### Option 2: Manual Configuration

Set the following environment variables:

- `GITHUB_APP_ID`
- `GITHUB_PRIVATE_KEY`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
```

## Files to Create/Modify

- `src/routes/app/setup/+page.svelte` (new)
- `src/routes/api/github-app/manifest/+server.ts` (new)
- `src/routes/api/github-app/callback/+server.ts` (new)
- `src/routes/api/github-app/status/+server.ts` (new)
- `src/lib/server/github-app-store.ts` (new)
- `src/lib/server/crypto.ts` (new)
- `src/lib/server/db/schema.ts` (add table)
- `src/lib/server/env.ts` (update)
- `src/routes/auth/github/+server.ts` (update)
- `README.md` (update)

## Security Considerations

- Encrypt all sensitive credentials in database
- Use secure encryption key (generate on first run, store in env)
- Validate state parameter in callback
- Rate limit app creation endpoint
- Only allow authenticated admins to create apps

## Testing

- Test fresh setup flow
- Test with existing .env credentials (backward compatibility)
- Test app installation on repository
- Test OAuth flow with dynamic credentials
- Test webhook handling with dynamic secret

## Limitations

- Each instance can only have one GitHub App
- User must have permission to create GitHub Apps
- App installation is separate step after creation

## Dependencies

- Requires `ENCRYPTION_KEY` environment variable for secure credential storage
