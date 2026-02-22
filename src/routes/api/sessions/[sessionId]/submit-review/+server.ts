import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { getAppOctokit } from '$lib/server/auth/github';

function formatInlineFallbackComment(path: string | null, line: number | null, body: string) {
	const location = path ? `\`${path}${line != null ? `:${line}` : ''}\`` : 'this file';
	return `Inline comment fallback for ${location}:\n\n${body}`;
}

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
		throw error(
			400,
			'A comment is required when requesting changes. Please provide feedback explaining what changes are needed.'
		);
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
		.innerJoin(
			table.githubInstallations,
			eq(table.repos.installationId, table.githubInstallations.id)
		)
		.where(eq(table.reviewSessions.id, params.sessionId))
		.get();

	if (!session) throw error(404, 'Session not found');

	// Guard against submitting when PR has new commits (session is stale)
	const octokit = getAppOctokit(session.installation.installationId);
	let latestPrState: 'open' | 'closed' = 'open';
	try {
		const { data: latestPr } = await octokit.pulls.get({
			owner: session.repo.owner,
			repo: session.repo.name,
			pull_number: session.pr.number
		});
		latestPrState = latestPr.state;
		if (latestPr.head.sha !== session.session.headSha) {
			throw error(
				409,
				'This review session is based on an older commit. New changes have been pushed to the PR. Please refresh the session to the latest commit before submitting your review.'
			);
		}
	} catch (err: any) {
		if (err.status === 409) throw err;
		console.error('Failed to verify PR head:', err);
	}

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

	const validInlineDraftComments = inlineDraftComments.filter(
		(dc) => dc.comment.path && dc.comment.line != null
	);

	const inlineComments = validInlineDraftComments.map((dc) => ({
		path: dc.comment.path!,
		line: dc.comment.line!,
		side: (dc.comment.side as 'LEFT' | 'RIGHT' | null) ?? undefined,
		start_line: dc.comment.startLine ?? undefined,
		start_side: (dc.comment.startSide as 'LEFT' | 'RIGHT' | null) ?? undefined,
		body: dc.comment.bodyMarkdown
	}));

	const hasBody = reviewBody && reviewBody.trim();
	const hasInlineComments = inlineComments.length > 0;
	const hasAnyDraftComments =
		inlineDraftComments.length > 0 || conversationDraftComments.length > 0;

	// GitHub requires either a body comment or at least one inline comment for the review
	// If user has conversation comments but no body and no inline comments,
	// generate a body from the conversation comments
	let finalReviewBody = hasBody ? reviewBody!.trim() : '';
	let reviewBodyGeneratedFromConversation = false;
	if (!finalReviewBody && !hasInlineComments && conversationDraftComments.length > 0) {
		// Create a body from conversation comments
		finalReviewBody = conversationDraftComments
			.map((dc) => dc.comment.bodyMarkdown)
			.join('\n\n---\n\n');
		reviewBodyGeneratedFromConversation = true;
	}
	if (!finalReviewBody && hasInlineComments) {
		// GitHub may treat approve-with-inline payloads as COMMENTED.
		// Ensure we always submit an explicit review body for the selected event.
		finalReviewBody =
			event === 'APPROVE' ? 'Approved. See inline comments.' : 'See inline comments.';
	}

	// Final check: GitHub still requires either a body or inline comments
	if (!finalReviewBody && !hasInlineComments) {
		throw error(
			400,
			'A review must include either a body comment or at least one inline comment. Please add feedback or inline comments before submitting.'
		);
	}

	try {
		if (latestPrState === 'open') {
			const reviewParams: {
				owner: string;
				repo: string;
				pull_number: number;
				event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
				body?: string;
				commit_id: string;
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

			await octokit.pulls.createReview(reviewParams);
		} else if (finalReviewBody && !reviewBodyGeneratedFromConversation) {
			// Closed PRs cannot receive a formal review state, so publish the summary as a PR comment.
			await octokit.issues.createComment({
				owner: session.repo.owner,
				repo: session.repo.name,
				issue_number: session.pr.number,
				body: finalReviewBody
			});
		}

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

		// Publish inline draft comments after review submission to preserve APPROVE/REQUEST_CHANGES state.
		if (hasInlineComments) {
			for (const draftComment of validInlineDraftComments) {
				try {
					await db
						.update(table.draftComments)
						.set({ status: 'publishing' })
						.where(eq(table.draftComments.id, draftComment.comment.id));

					let inlineResponseId: string;
					try {
						const inlineResponse = await octokit.pulls.createReviewComment({
							owner: session.repo.owner,
							repo: session.repo.name,
							pull_number: session.pr.number,
							body: draftComment.comment.bodyMarkdown,
							commit_id: session.pr.headSha,
							path: draftComment.comment.path!,
							line: draftComment.comment.line!,
							side: (draftComment.comment.side as 'LEFT' | 'RIGHT' | undefined) ?? undefined,
							start_line: draftComment.comment.startLine ?? undefined,
							start_side:
								(draftComment.comment.startSide as 'LEFT' | 'RIGHT' | undefined) ?? undefined
						});
						inlineResponseId = inlineResponse.data.id.toString();
					} catch (inlineErr: any) {
						if (inlineErr?.status !== 422) {
							throw inlineErr;
						}
						const fallbackComment = await octokit.issues.createComment({
							owner: session.repo.owner,
							repo: session.repo.name,
							issue_number: session.pr.number,
							body: formatInlineFallbackComment(
								draftComment.comment.path,
								draftComment.comment.line,
								draftComment.comment.bodyMarkdown
							)
						});
						inlineResponseId = fallbackComment.data.id.toString();
					}

					await db
						.update(table.draftComments)
						.set({
							status: 'published',
							githubCommentId: inlineResponseId,
							updatedAt: new Date()
						})
						.where(eq(table.draftComments.id, draftComment.comment.id));
				} catch (err: any) {
					console.error(`Failed to publish inline comment ${draftComment.comment.id}:`, err);
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
		}

		// Mark session as completed
		await db
			.update(table.reviewSessions)
			.set({
				status: 'completed',
				updatedAt: new Date()
			})
			.where(eq(table.reviewSessions.id, session.session.id));

		return json({
			ok: true,
			message:
				latestPrState === 'closed'
					? 'Pull request is closed. Published comments only (no review state submitted).'
					: 'Review submitted successfully.'
		});
	} catch (err: any) {
		console.error('Failed to submit review:', err);
		throw error(500, 'Failed to submit review to GitHub');
	}
};
