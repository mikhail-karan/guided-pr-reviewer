import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const steps = await db
		.select({ id: table.reviewSteps.id })
		.from(table.reviewSteps)
		.where(eq(table.reviewSteps.sessionId, params.sessionId))
		.all();

	return json({ stepCount: steps.length });
};
