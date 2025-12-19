import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { getAppOctokit } from '$lib/server/auth/github';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const body = await request.json();
	const { event, body: reviewBody } = body;

	if (!event) throw error(400, 'Missing event (APPROVE, REQUEST_CHANGES, or COMMENT)');

	const validEvents = ['APPROVE', 'REQUEST_CHANGES', 'COMMENT'] as const;
	if (!validEvents.includes(event as any)) {
		throw error(400, `Invalid event. Must be one of: ${validEvents.join(', ')}`);
	}

	// GitHub requires a comment body when requesting changes
	if (event === 'REQUEST_CHANGES' && (!reviewBody || !reviewBody.trim())) {
		throw error(400, 'A comment is required when requesting changes. Please provide feedback explaining what changes are needed.');
	}

	const session = await db
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

	if (!session) throw error(404, 'Session not found');

	// Fetch all unpublished inline draft comments for this session
	const draftComments = await db
		.select({
			comment: table.draftComments,
			step: table.reviewSteps
		})
		.from(table.draftComments)
		.innerJoin(table.reviewSteps, eq(table.draftComments.stepId, table.reviewSteps.id))
		.where(eq(table.reviewSteps.sessionId, params.sessionId))
		.all();

	const inlineDraftComments = draftComments.filter(
		(dc) => dc.comment.targetType === 'inline' && dc.comment.status === 'draft'
	);
	const conversationDraftComments = draftComments.filter(
		(dc) => dc.comment.targetType === 'conversation' && dc.comment.status === 'draft'
	);

	const inlineComments = inlineDraftComments.map((dc) => ({
		path: dc.comment.path!,
		position: dc.comment.line!, // position in diff (using line number as approximation)
		body: dc.comment.bodyMarkdown
	}));

	const hasBody = reviewBody && reviewBody.trim();
	const hasInlineComments = inlineComments.length > 0;
	const hasAnyDraftComments = inlineDraftComments.length > 0 || conversationDraftComments.length > 0;

	// GitHub requires either a body comment or at least one inline comment for the review
	// If user has conversation comments but no body and no inline comments,
	// generate a body from the conversation comments
	let finalReviewBody = hasBody ? reviewBody!.trim() : '';
	if (!finalReviewBody && !hasInlineComments && conversationDraftComments.length > 0) {
		// Create a body from conversation comments
		finalReviewBody = conversationDraftComments
			.map((dc) => dc.comment.bodyMarkdown)
			.join('\n\n---\n\n');
	}

	// Final check: GitHub still requires either a body or inline comments
	if (!finalReviewBody && !hasInlineComments) {
		throw error(
			400,
			'A review must include either a body comment or at least one inline comment. Please add feedback or inline comments before submitting.'
		);
	}

	const octokit = getAppOctokit(session.installation.installationId);

	try {
		const reviewParams: {
			owner: string;
			repo: string;
			pull_number: number;
			event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
			body?: string;
			commit_id: string;
			comments?: Array<{
				path: string;
				position: number;
				body: string;
			}>;
		} = {
			owner: session.repo.owner,
			repo: session.repo.name,
			pull_number: session.pr.number,
			event: event as 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT',
			commit_id: session.session.headSha
		};

		// Include body if provided or generated
		if (finalReviewBody) {
			reviewParams.body = finalReviewBody;
		}

		// Include inline comments if any
		if (hasInlineComments) {
			reviewParams.comments = inlineComments;
		}

		await octokit.pulls.createReview(reviewParams);

		// Publish conversation-type draft comments as regular PR comments
		for (const draftComment of conversationDraftComments) {
			try {
				await db
					.update(table.draftComments)
					.set({ status: 'publishing' })
					.where(eq(table.draftComments.id, draftComment.comment.id));

				const commentResponse = await octokit.issues.createComment({
					owner: session.repo.owner,
					repo: session.repo.name,
					issue_number: session.pr.number,
					body: draftComment.comment.bodyMarkdown
				});

				await db
					.update(table.draftComments)
					.set({
						status: 'published',
						githubCommentId: commentResponse.data.id.toString(),
						updatedAt: new Date()
					})
					.where(eq(table.draftComments.id, draftComment.comment.id));
			} catch (err: any) {
				console.error(`Failed to publish conversation comment ${draftComment.comment.id}:`, err);
				await db
					.update(table.draftComments)
					.set({
						status: 'failed',
						errorMessage: err.message,
						updatedAt: new Date()
					})
					.where(eq(table.draftComments.id, draftComment.comment.id));
			}
		}

		// Mark inline draft comments as published (they were included in the review)
		if (hasInlineComments) {
			const inlineCommentIds = inlineDraftComments.map((dc) => dc.comment.id);
			await db
				.update(table.draftComments)
				.set({
					status: 'published',
					updatedAt: new Date()
				})
				.where(inArray(table.draftComments.id, inlineCommentIds));
		}

		// Mark session as completed
		await db
			.update(table.reviewSessions)
			.set({
				status: 'completed',
				updatedAt: new Date()
			})
			.where(eq(table.reviewSessions.id, session.session.id));

		return json({ ok: true });
	} catch (err: any) {
		console.error('Failed to submit review:', err);
		throw error(500, 'Failed to submit review to GitHub');
	}
};

