import { db } from '../db';
import * as table from '../db/schema';
import { v4 as uuidv4 } from 'uuid';
import { addJob } from './queue';

export async function generateStepsJob(sessionId: string, diff: string, files: any[]) {
	// Simple grouping: one step per file for now
	const steps = files.map((file, index) => ({
		id: uuidv4(),
		sessionId,
		orderIndex: index,
		title: `Review ${file.filename}`,
		category: file.status === 'added' ? 'New File' : 'Modification',
		riskTags: JSON.stringify(file.additions > 50 ? ['high-impact'] : []),
		complexity: file.additions + file.deletions > 100 ? 'L' : (file.additions + file.deletions > 30 ? 'M' : 'S'),
		status: 'not_started',
		diffHunksJson: JSON.stringify([{
			path: file.filename,
			patch: file.patch
		}]),
		createdAt: new Date(),
		updatedAt: new Date()
	}));

	for (const step of steps) {
		await db.insert(table.reviewSteps).values(step);
	}

	console.log(`Generated ${steps.length} steps for session ${sessionId}`);

	// Trigger next jobs
	await addJob('generate_ai_guidance', { sessionId });
	for (const step of steps) {
		await addJob('build_context_pack', { stepId: step.id });
	}
}

