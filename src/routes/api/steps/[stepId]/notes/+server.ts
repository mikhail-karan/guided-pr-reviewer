import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { v4 as uuidv4 } from 'uuid';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const body = await request.json();
	const { severity, noteMarkdown } = body;

	if (!severity || !noteMarkdown) {
		throw error(400, 'Missing required fields');
	}

	const noteId = uuidv4();
	const note = {
		id: noteId,
		stepId: params.stepId,
		authorUserId: locals.user.id,
		severity,
		noteMarkdown,
		createdAt: new Date(),
		updatedAt: new Date()
	};

	await db.insert(table.reviewerNotes).values(note);

	return json(note);
};

