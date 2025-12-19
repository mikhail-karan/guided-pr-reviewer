import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getAppOctokit } from '$lib/server/auth/github';

export const load: PageServerLoad = async ({ params }) => {
	const installation = await db
		.select()
		.from(table.githubInstallations)
		.where(eq(table.githubInstallations.id, params.installationId))
		.get();

	if (!installation) {
		throw error(404, 'Installation not found');
	}

	try {
		const octokit = getAppOctokit(installation.installationId);
		const { data } = await octokit.apps.listReposAccessibleToInstallation({
			installation_id: parseInt(installation.installationId)
		});

		return {
			installation,
			repositories: data.repositories
		};
	} catch (err) {
		console.error('Failed to fetch repos:', err);
		throw error(500, 'Failed to fetch repositories from GitHub');
	}
};

