import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { addJob } from '$lib/server/jobs/queue';

export const POST: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const { sessionId } = params;

	// Verify session exists and user has access
	const session = await db
		.select({
			session: table.reviewSessions,
			pr: table.pullRequests
		})
		.from(table.reviewSessions)
		.innerJoin(table.pullRequests, eq(table.reviewSessions.pullRequestId, table.pullRequests.id))
		.where(eq(table.reviewSessions.id, sessionId))
		.get();

	if (!session) {
		throw error(404, 'Session not found');
	}

	// Verify user owns the session
	if (session.session.createdByUserId !== locals.user.id) {
		throw error(403, 'Forbidden');
	}

	// Queue the AI guidance job
	try {
		await addJob('generate_ai_guidance', { sessionId });
		return json({ success: true, message: 'AI guidance regeneration queued' });
	} catch (err) {
		console.error('Error queueing AI guidance job:', err);
		throw error(500, 'Failed to queue AI guidance job');
	}
};

