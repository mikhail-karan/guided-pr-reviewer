// Use process.env directly for the worker, and $env for SvelteKit
const getEnv = (key: string, fallback: string = ''): string => {
	if (typeof process !== 'undefined' && process.env && process.env[key]) {
		return process.env[key] as string;
	}
	return fallback;
};

export const ENV = {
	get APP_BASE_URL() { return getEnv('APP_BASE_URL', 'http://localhost:3000'); },
	get PORT() { return Number(getEnv('PORT', '3000')); },
	
	get GITHUB_APP_ID() { return getEnv('GITHUB_APP_ID'); },
	get GITHUB_APP_NAME() { return getEnv('GITHUB_APP_NAME'); },
	get GITHUB_APP_PRIVATE_KEY() { return getEnv('GITHUB_APP_PRIVATE_KEY'); },
	get GITHUB_CLIENT_ID() { return getEnv('GITHUB_CLIENT_ID'); },
	get GITHUB_CLIENT_SECRET() { return getEnv('GITHUB_CLIENT_SECRET'); },
	get GITHUB_WEBHOOK_SECRET() { return getEnv('GITHUB_WEBHOOK_SECRET'); },
	
	get DATABASE_URL() { return getEnv('DATABASE_URL', 'data/pr-reviewer.db'); },
	get REDIS_URL() { return getEnv('REDIS_URL', 'redis://localhost:6379'); },
	
	get LLM_API_KEY() { return getEnv('LLM_API_KEY'); },
	get LLM_BASE_URL() { return getEnv('LLM_BASE_URL', 'https://openrouter.ai/api/v1'); },
	get LLM_MODEL() { return getEnv('LLM_MODEL', 'anthropic/claude-3.5-sonnet'); }
};

// Validate critical env vars (skip during build)
if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'test') {
	const required = [
		'GITHUB_APP_ID',
		'GITHUB_APP_NAME',
		'GITHUB_APP_PRIVATE_KEY',
		'GITHUB_CLIENT_ID',
		'GITHUB_CLIENT_SECRET'
	];

	for (const key of required) {
		if (!ENV[key as keyof typeof ENV]) {
			console.warn(`Missing required environment variable: ${key}`);
		}
	}
}

