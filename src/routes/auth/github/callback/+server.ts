import { redirect, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAccessToken, getGithubUser } from '$lib/server/auth/github';
import {
	createSession,
	generateSessionToken,
	setSessionTokenCookie
} from '$lib/server/auth/session';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export const GET: RequestHandler = async (event) => {
	const code = event.url.searchParams.get('code');
	if (!code) {
		throw error(400, 'Missing code');
	}

	try {
		const { access_token } = await getAccessToken(code);
		if (!access_token) {
			console.error('No access token returned from GitHub');
			throw error(401, 'Failed to get access token');
		}

		const githubUser = await getGithubUser(access_token);

		// Find or create user
		let existingUser = await db
			.select()
			.from(table.user)
			.where(eq(table.user.githubUserId, githubUser.id.toString()))
			.get();

		let userId: string;

		if (existingUser) {
			userId = existingUser.id;
			// Update user info
			await db
				.update(table.user)
				.set({
					login: githubUser.login,
					name: githubUser.name,
					email: githubUser.email,
					avatarUrl: githubUser.avatar_url,
					accessTokenEncrypted: access_token, // In a real app, encrypt this!
					updatedAt: new Date()
				})
				.where(eq(table.user.id, userId));
		} else {
			userId = uuidv4();
			await db.insert(table.user).values({
				id: userId,
				githubUserId: githubUser.id.toString(),
				login: githubUser.login,
				name: githubUser.name,
				email: githubUser.email,
				avatarUrl: githubUser.avatar_url,
				accessTokenEncrypted: access_token, // In a real app, encrypt this!
				createdAt: new Date(),
				updatedAt: new Date()
			});
		}

		const sessionToken = generateSessionToken();
		const session = await createSession(sessionToken, userId);
		setSessionTokenCookie(event, sessionToken, session.expiresAt);

		throw redirect(302, '/app');
	} catch (err: any) {
		if (err?.status && err?.location) throw err; // Handle SvelteKit redirect
		if (err?.status && err?.body) throw err; // Handle SvelteKit error

		console.error('Auth error:', err);
		throw error(500, 'Authentication failed');
	}
};
