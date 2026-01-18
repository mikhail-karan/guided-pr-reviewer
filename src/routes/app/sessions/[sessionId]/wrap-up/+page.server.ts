import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const sessionData = await db
		.select({
			session: table.reviewSessions,
			pr: table.pullRequests,
			repo: table.repos
		})
		.from(table.reviewSessions)
		.innerJoin(table.pullRequests, eq(table.reviewSessions.pullRequestId, table.pullRequests.id))
		.innerJoin(table.repos, eq(table.pullRequests.repoId, table.repos.id))
		.where(eq(table.reviewSessions.id, params.sessionId))
		.get();

	if (!sessionData) {
		throw error(404, 'Session not found');
	}

	const steps = await db
		.select()
		.from(table.reviewSteps)
		.where(eq(table.reviewSteps.sessionId, params.sessionId))
		.all();

	const notes = await db
		.select({
			note: table.reviewerNotes,
			step: table.reviewSteps
		})
		.from(table.reviewerNotes)
		.innerJoin(table.reviewSteps, eq(table.reviewerNotes.stepId, table.reviewSteps.id))
		.where(eq(table.reviewSteps.sessionId, params.sessionId))
		.all();

	const draftComments = await db
		.select({
			comment: table.draftComments,
			step: table.reviewSteps
		})
		.from(table.draftComments)
		.innerJoin(table.reviewSteps, eq(table.draftComments.stepId, table.reviewSteps.id))
		.where(eq(table.reviewSteps.sessionId, params.sessionId))
		.all();

	return {
		session: sessionData.session,
		pr: sessionData.pr,
		repo: sessionData.repo,
		steps,
		notes,
		draftComments
	};
};


