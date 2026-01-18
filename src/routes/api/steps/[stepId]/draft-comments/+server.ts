import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { v4 as uuidv4 } from 'uuid';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const body = await request.json();
	const { targetType, bodyMarkdown, path, side, line, startLine } = body;

	if (!targetType || !bodyMarkdown) {
		throw error(400, 'Missing required fields');
	}

	const draftId = uuidv4();
	const draft = {
		id: draftId,
		stepId: params.stepId,
		authorUserId: locals.user.id,
		status: 'draft',
		targetType,
		bodyMarkdown,
		path,
		side,
		line: line ? parseInt(line) : null,
		startLine: startLine ? parseInt(startLine) : null,
		createdAt: new Date(),
		updatedAt: new Date()
	};

	await db.insert(table.draftComments).values(draft);

	return json(draft);
};


