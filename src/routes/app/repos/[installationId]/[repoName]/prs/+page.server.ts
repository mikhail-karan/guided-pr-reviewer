import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { getAppOctokit } from '$lib/server/auth/github';
import { v4 as uuidv4 } from 'uuid';
import { addJob } from '$lib/server/jobs/queue';

export const load: PageServerLoad = async ({ params, url }) => {
	const state = url.searchParams.get('state') === 'closed' ? 'closed' : 'open';

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
		const { data: pulls } = await octokit.pulls.list({
			owner: installation.accountLogin,
			repo: params.repoName,
			state
		});

		// Also check for existing sessions
		const sessions = await db
			.select({
				id: table.reviewSessions.id,
				pullRequestId: table.reviewSessions.pullRequestId,
				headSha: table.reviewSessions.headSha,
				status: table.reviewSessions.status,
				prNumber: table.pullRequests.number
			})
			.from(table.reviewSessions)
			.innerJoin(table.pullRequests, eq(table.reviewSessions.pullRequestId, table.pullRequests.id))
			.innerJoin(table.repos, eq(table.pullRequests.repoId, table.repos.id))
			.where(eq(table.repos.name, params.repoName))
			.all();

		return {
			installation,
			repoName: params.repoName,
			state,
			pulls,
			sessions
		};
	} catch (err) {
		console.error('Failed to fetch PRs:', err);
		throw error(500, 'Failed to fetch PRs from GitHub');
	}
};

export const actions: Actions = {
	startReview: async ({ request, locals }) => {
		if (!locals.user) throw error(401, 'Unauthorized');

		const formData = await request.formData();
		const installationId = formData.get('installationId') as string;
		const owner = formData.get('owner') as string;
		const repoName = formData.get('repo') as string;
		const prNumber = parseInt(formData.get('prNumber') as string);

		if (!installationId || !owner || !repoName || !prNumber) {
			throw error(400, 'Missing required fields');
		}

		const installation = await db
			.select()
			.from(table.githubInstallations)
			.where(eq(table.githubInstallations.id, installationId))
			.get();

		if (!installation) {
			throw error(404, 'Installation not found');
		}

		// 1. Ensure repo exists in DB
		let repo = await db
			.select()
			.from(table.repos)
			.where(and(eq(table.repos.owner, owner), eq(table.repos.name, repoName)))
			.get();

		if (!repo) {
			const octokit = getAppOctokit(installation.installationId);
			const { data: repoData } = await octokit.repos.get({ owner, repo: repoName });

			repo = {
				id: uuidv4(),
				installationId,
				owner,
				name: repoName,
				defaultBranch: repoData.default_branch,
				codebaseContextJson: null,
				createdAt: new Date(),
				updatedAt: new Date()
			};
			await db.insert(table.repos).values(repo);

			// Gather codebase context in the background for better AI reviews
			await addJob('gather_repo_context', { repoId: repo.id });
		}

		// 2. Fetch PR info from GitHub
		const octokit = getAppOctokit(installation.installationId);
		const { data: prData } = await octokit.pulls.get({
			owner,
			repo: repoName,
			pull_number: prNumber
		});

		// 3. Ensure PR exists in DB
		let pr = await db
			.select()
			.from(table.pullRequests)
			.where(
				and(
					eq(table.pullRequests.repoId, repo.id),
					eq(table.pullRequests.number, prNumber),
					eq(table.pullRequests.headSha, prData.head.sha)
				)
			)
			.get();

		if (!pr) {
			pr = {
				id: uuidv4(),
				repoId: repo.id,
				number: prNumber,
				title: prData.title,
				authorLogin: prData.user?.login || 'unknown',
				baseRef: prData.base.ref,
				headRef: prData.head.ref,
				baseSha: prData.base.sha,
				headSha: prData.head.sha,
				state: prData.state,
				createdAt: new Date(),
				updatedAt: new Date()
			};
			await db.insert(table.pullRequests).values(pr);
		}

		// 4. Create Review Session
		const sessionId = uuidv4();
		await db.insert(table.reviewSessions).values({
			id: sessionId,
			pullRequestId: pr.id,
			createdByUserId: locals.user.id,
			headSha: pr.headSha,
			status: 'active',
			isStale: false,
			createdAt: new Date(),
			updatedAt: new Date()
		});

		// 5. Enqueue ingest_pr job
		await addJob('ingest_pr', { sessionId });

		throw redirect(303, `/app/sessions/${sessionId}`);
	}
};
