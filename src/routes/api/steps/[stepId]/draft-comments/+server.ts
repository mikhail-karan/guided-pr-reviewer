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

	// Validate inline comment fields
	if (targetType === 'inline') {
		if (!path || !line || !side) {
			throw error(400, 'Inline comments require path, line, and side');
		}
		if (side !== 'LEFT' && side !== 'RIGHT') {
			throw error(400, 'Side must be LEFT or RIGHT');
		}
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
