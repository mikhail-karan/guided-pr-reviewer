import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { getAppOctokit } from '$lib/server/auth/github';

export const POST: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const draft = await db
		.select({
			draft: table.draftComments,
			step: table.reviewSteps,
			session: table.reviewSessions,
			pr: table.pullRequests,
			repo: table.repos,
			installation: table.githubInstallations
		})
		.from(table.draftComments)
		.innerJoin(table.reviewSteps, eq(table.draftComments.stepId, table.reviewSteps.id))
		.innerJoin(table.reviewSessions, eq(table.reviewSteps.sessionId, table.reviewSessions.id))
		.innerJoin(table.pullRequests, eq(table.reviewSessions.pullRequestId, table.pullRequests.id))
		.innerJoin(table.repos, eq(table.pullRequests.repoId, table.repos.id))
		.innerJoin(table.githubInstallations, eq(table.repos.installationId, table.githubInstallations.id))
		.where(eq(table.draftComments.id, params.id))
		.get();

	if (!draft) throw error(404, 'Draft not found');
	if (draft.draft.status === 'published') throw error(400, 'Already published');

	const octokit = getAppOctokit(draft.installation.installationId);

	try {
		await db
			.update(table.draftComments)
			.set({ status: 'publishing' })
			.where(eq(table.draftComments.id, draft.draft.id));

		let response;

		if (draft.draft.targetType === 'inline') {
			response = await octokit.pulls.createReviewComment({
				owner: draft.repo.owner,
				repo: draft.repo.name,
				pull_number: draft.pr.number,
				body: draft.draft.bodyMarkdown,
				commit_id: draft.pr.headSha,
				path: draft.draft.path!,
				line: draft.draft.line!,
				side: draft.draft.side as 'LEFT' | 'RIGHT' | undefined,
				start_line: draft.draft.startLine || undefined
			});
		} else {
			response = await octokit.issues.createComment({
				owner: draft.repo.owner,
				repo: draft.repo.name,
				issue_number: draft.pr.number,
				body: draft.draft.bodyMarkdown
			});
		}

		await db
			.update(table.draftComments)
			.set({
				status: 'published',
				githubCommentId: response.data.id.toString(),
				updatedAt: new Date()
			})
			.where(eq(table.draftComments.id, draft.draft.id));

		return json({ ok: true, githubCommentId: response.data.id });
	} catch (err: any) {
		console.error('Failed to publish comment:', err);
		await db
			.update(table.draftComments)
			.set({
				status: 'failed',
				errorMessage: err.message,
				updatedAt: new Date()
			})
			.where(eq(table.draftComments.id, draft.draft.id));
		
		throw error(500, 'Failed to publish to GitHub');
	}
};


