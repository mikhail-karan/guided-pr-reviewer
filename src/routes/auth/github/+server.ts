import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ENV } from '$lib/server/env';

export const GET: RequestHandler = async () => {
	const githubAuthUrl = new URL('https://github.com/login/oauth/authorize');
	githubAuthUrl.searchParams.set('client_id', ENV.GITHUB_CLIENT_ID);
	githubAuthUrl.searchParams.set('redirect_uri', `${ENV.APP_BASE_URL}/auth/github/callback`);
	// We don't necessarily need specific scopes if we just want to identify the user,
	// but for user-to-server actions we might need some.
	// For now, minimal scopes.
	// githubAuthUrl.searchParams.set('scope', 'user:email');

	throw redirect(302, githubAuthUrl.toString());
};

