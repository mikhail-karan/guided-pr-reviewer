import { db } from '../db';
import * as table from '../db/schema';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export async function buildContextPackJob(stepId: string) {
	console.log(`Building context pack for step ${stepId}`);
	// In MVP, we can start with an empty context pack or just the file content

	await db.insert(table.contextPacks).values({
		id: uuidv4(),
		stepId,
		itemsJson: JSON.stringify([]),
		createdAt: new Date(),
		updatedAt: new Date()
	});
}
