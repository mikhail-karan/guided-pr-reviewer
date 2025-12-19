import { redirect } from '@sveltejs/kit';
import { ENV } from '$lib/server/env';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(302, '/auth/github');
	}

	return {
		user: locals.user,
		githubAppName: ENV.GITHUB_APP_NAME
	};
};

