import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import { ENV } from '../env';

export function getAppOctokit(installationId?: string | number) {
	const auth: any = {
		appId: ENV.GITHUB_APP_ID,
		privateKey: ENV.GITHUB_APP_PRIVATE_KEY,
		clientId: ENV.GITHUB_CLIENT_ID,
		clientSecret: ENV.GITHUB_CLIENT_SECRET
	};

	if (installationId) {
		auth.installationId = installationId;
	}

	return new Octokit({
		authStrategy: createAppAuth,
		auth
	});
}

export function getUserOctokit(accessToken: string) {
	return new Octokit({
		auth: accessToken
	});
}

/**
 * Exchange OAuth code for an access token
 */
export async function getAccessToken(code: string) {
	const response = await fetch('https://github.com/login/oauth/access_token', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json'
		},
		body: JSON.stringify({
			client_id: ENV.GITHUB_CLIENT_ID,
			client_secret: ENV.GITHUB_CLIENT_SECRET,
			code
		})
	});

	if (!response.ok) {
		throw new Error('Failed to fetch access token');
	}

	const data = await response.json();
	
	if (data.error) {
		throw new Error(`GitHub OAuth error: ${data.error_description || data.error}`);
	}
	
	return data as { access_token: string; token_type: string; scope: string };
}

/**
 * Get user info using access token
 */
export async function getGithubUser(accessToken: string) {
	const octokit = getUserOctokit(accessToken);
	const { data } = await octokit.users.getAuthenticated();
	return data;
}

