import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { eq, asc } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getAppOctokit } from '$lib/server/auth/github';

export const load: PageServerLoad = async ({ params }) => {
	const sessionData = await db
		.select({
			session: table.reviewSessions,
			pr: table.pullRequests,
			repo: table.repos,
			installation: table.githubInstallations
		})
		.from(table.reviewSessions)
		.innerJoin(table.pullRequests, eq(table.reviewSessions.pullRequestId, table.pullRequests.id))
		.innerJoin(table.repos, eq(table.pullRequests.repoId, table.repos.id))
		.innerJoin(table.githubInstallations, eq(table.repos.installationId, table.githubInstallations.id))
		.where(eq(table.reviewSessions.id, params.sessionId))
		.get();

	if (!sessionData) {
		throw error(404, 'Session not found');
	}

	const { session, pr, repo, installation } = sessionData;

	// Check if stale
	let isStale = session.isStale;
	try {
		const octokit = getAppOctokit(installation.installationId);
		const { data: latestPr } = await octokit.pulls.get({
			owner: repo.owner,
			repo: repo.name,
			pull_number: pr.number
		});

		if (latestPr.head.sha !== session.headSha) {
			isStale = true;
			await db
				.update(table.reviewSessions)
				.set({ isStale: true })
				.where(eq(table.reviewSessions.id, session.id));
		}
	} catch (err) {
		console.warn('Failed to check for PR updates:', err);
	}

	const steps = await db
		.select()
		.from(table.reviewSteps)
		.where(eq(table.reviewSteps.sessionId, params.sessionId))
		.orderBy(asc(table.reviewSteps.orderIndex))
		.all();

	return {
		session: { ...session, isStale },
		pr,
		repo,
		steps
	};
};

