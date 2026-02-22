import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { getAppOctokit } from '$lib/server/auth/github';
import { addJob } from '$lib/server/jobs/queue';
import { v4 as uuidv4 } from 'uuid';

export const POST: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const { sessionId } = params;

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
		.innerJoin(
			table.githubInstallations,
			eq(table.repos.installationId, table.githubInstallations.id)
		)
		.where(eq(table.reviewSessions.id, sessionId))
		.get();

	if (!sessionData) {
		throw error(404, 'Session not found');
	}

	if (sessionData.session.createdByUserId !== locals.user.id) {
		throw error(403, 'Forbidden');
	}

	const { session, pr, repo, installation } = sessionData;

	let latestPr;
	try {
		const octokit = getAppOctokit(installation.installationId);
		const { data } = await octokit.pulls.get({
			owner: repo.owner,
			repo: repo.name,
			pull_number: pr.number
		});
		latestPr = data;
	} catch (err) {
		console.error('Failed to fetch PR from GitHub:', err);
		throw error(500, 'Failed to fetch PR from GitHub');
	}

	const newHeadSha = latestPr.head.sha;
	if (newHeadSha === session.headSha) {
		return json({ success: true, refreshed: false, message: 'Already on latest commit' });
	}

	// Find or create PR row for new head SHA
	let newPr = await db
		.select()
		.from(table.pullRequests)
		.where(
			and(
				eq(table.pullRequests.repoId, repo.id),
				eq(table.pullRequests.number, pr.number),
				eq(table.pullRequests.headSha, newHeadSha)
			)
		)
		.get();

	if (!newPr) {
		newPr = {
			id: uuidv4(),
			repoId: repo.id,
			number: pr.number,
			title: latestPr.title,
			authorLogin: latestPr.user?.login || 'unknown',
			baseRef: latestPr.base.ref,
			headRef: latestPr.head.ref,
			baseSha: latestPr.base.sha,
			headSha: newHeadSha,
			state: latestPr.state,
			createdAt: new Date(),
			updatedAt: new Date()
		};
		await db.insert(table.pullRequests).values(newPr);
	}

	// Update session to point at new PR and clear stale flag
	await db
		.update(table.reviewSessions)
		.set({
			pullRequestId: newPr.id,
			headSha: newHeadSha,
			isStale: false,
			prSummaryJson: null,
			updatedAt: new Date()
		})
		.where(eq(table.reviewSessions.id, sessionId));

	// Enqueue ingest_pr to regenerate steps and context (jobId for dedupe on rapid refresh clicks)
	await addJob(
		'ingest_pr',
		{ sessionId },
		{
			jobId: `ingest_pr-${sessionId}-${newHeadSha}`
		}
	);

	return json({
		success: true,
		refreshed: true,
		message: 'Session refreshed to latest commit',
		headSha: newHeadSha
	});
};
