import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const step = await db
		.select()
		.from(table.reviewSteps)
		.where(eq(table.reviewSteps.id, params.stepId))
		.get();

	if (!step) {
		throw error(404, 'Step not found');
	}

	const session = await db
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

	if (!session) {
		throw error(404, 'Session not found');
	}

	const contextPack = await db
		.select()
		.from(table.contextPacks)
		.where(eq(table.contextPacks.stepId, params.stepId))
		.get();

	const notes = await db
		.select()
		.from(table.reviewerNotes)
		.where(eq(table.reviewerNotes.stepId, params.stepId))
		.all();

	const draftComments = await db
		.select()
		.from(table.draftComments)
		.where(eq(table.draftComments.stepId, params.stepId))
		.all();

	const chatMessages = await db
		.select()
		.from(table.stepChatMessages)
		.where(eq(table.stepChatMessages.stepId, params.stepId))
		.orderBy(asc(table.stepChatMessages.createdAt))
		.all();

	const allSteps = await db
		.select({ id: table.reviewSteps.id, orderIndex: table.reviewSteps.orderIndex })
		.from(table.reviewSteps)
		.where(eq(table.reviewSteps.sessionId, params.sessionId))
		.orderBy(table.reviewSteps.orderIndex)
		.all();

	const currentIndex = allSteps.findIndex((s) => s.id === params.stepId);
	const prevStep = currentIndex > 0 ? allSteps[currentIndex - 1] : null;
	const nextStep = currentIndex < allSteps.length - 1 ? allSteps[currentIndex + 1] : null;

	return {
		step,
		session: session.session,
		pr: session.pr,
		repo: session.repo,
		contextPack,
		notes,
		draftComments,
		chatMessages,
		prevStepId: prevStep?.id,
		nextStepId: nextStep?.id,
		totalSteps: allSteps.length,
		currentStepNumber: currentIndex + 1
	};
};

export const actions: Actions = {
	updateStatus: async ({ params, request, locals }) => {
		if (!locals.user) throw error(401, 'Unauthorized');

		const formData = await request.formData();
		const status = formData.get('status') as string;

		if (!status) throw error(400, 'Missing status');

		await db
			.update(table.reviewSteps)
			.set({
				status: status as any,
				updatedAt: new Date()
			})
			.where(eq(table.reviewSteps.id, params.stepId));

		return { success: true };
	}
};
