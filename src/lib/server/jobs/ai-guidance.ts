import { db } from '../db';
import * as table from '../db/schema';
import { eq, asc } from 'drizzle-orm';
import { ai, LLM_MODEL } from '../ai/client';

export async function generateAiGuidanceJob(sessionId: string) {
	console.log(`Generating AI guidance for session ${sessionId}`);

	const session = await db
		.select({
			session: table.reviewSessions,
			pr: table.pullRequests,
		})
		.from(table.reviewSessions)
		.innerJoin(table.pullRequests, eq(table.reviewSessions.pullRequestId, table.pullRequests.id))
		.where(eq(table.reviewSessions.id, sessionId))
		.get();

	if (!session) return;

	const steps = await db
		.select()
		.from(table.reviewSteps)
		.where(eq(table.reviewSteps.sessionId, sessionId))
		.orderBy(asc(table.reviewSteps.orderIndex))
		.all();

	// 1. Generate PR Summary
	try {
		const fileList = steps.map((s) => `- ${s.title} (${s.category})`).join('\n');

		const summaryResponse = await ai.chat.completions.create({
			model: LLM_MODEL,
			messages: [
				{
					role: 'system',
					content: `You are an expert code reviewer that ALWAYS responds in valid JSON.
					
					The JSON must have this exact structure:
					{
						"overview": "A brief 2-3 sentence overview of the PR goals.",
						"keyChanges": ["list", "of", "important", "changes"]
					}`
				},
				{
					role: 'user',
					content: `PR Title: ${session.pr.title}\nFiles changed:\n${fileList}`
				}
			],
			response_format: { type: 'json_object' }
		});

		const summaryContent = summaryResponse.choices[0].message.content;
		if (summaryContent) {
			let finalizedContent = summaryContent;
			try {
				JSON.parse(summaryContent);
			} catch (e) {
				// Fallback: Wrap raw text if AI fails to provide JSON
				finalizedContent = JSON.stringify({
					overview: summaryContent,
					keyChanges: []
				});
			}

			await db
				.update(table.reviewSessions)
				.set({
					prSummaryJson: finalizedContent,
					updatedAt: new Date()
				})
				.where(eq(table.reviewSessions.id, sessionId));
		}
	} catch (error) {
		console.error('Error generating PR summary:', error);
	}

	// 2. Generate Step Guidance
	for (const step of steps) {
		try {
			const diffHunks = safeParse<any[]>(step.diffHunksJson, []);
			const diffText = diffHunks.map((h) => `File: ${h.path}\n${h.patch}`).join('\n\n');

			const stepResponse = await ai.chat.completions.create({
				model: LLM_MODEL,
				messages: [
					{
						role: 'system',
						content: `You are an expert code reviewer that ALWAYS responds in valid JSON.
						
						The JSON must have this exact structure:
						{
							"summary": "A concise summary of what this step involves.",
							"risks": [
								{ "description": "Specific risk or concern", "severity": "low|medium|high" }
							],
							"reviewQuestions": ["list", "of", "questions", "the", "reviewer", "should", "answer"]
						}`
					},
					{
						role: 'user',
						content: `Step: ${step.title}\nCategory: ${step.category}\nDiff:\n${diffText}`
					}
				],
				response_format: { type: 'json_object' }
			});

			const stepContent = stepResponse.choices[0].message.content;
			if (stepContent) {
				let finalizedContent = stepContent;
				try {
					JSON.parse(stepContent);
				} catch (e) {
					// Fallback: Wrap raw text if AI fails to provide JSON
					finalizedContent = JSON.stringify({
						summary: stepContent,
						risks: [],
						reviewQuestions: []
					});
				}

				await db
					.update(table.reviewSteps)
					.set({
						aiGuidanceJson: finalizedContent,
						updatedAt: new Date()
					})
					.where(eq(table.reviewSteps.id, step.id));
			}
		} catch (error) {
			console.error(`Error generating guidance for step ${step.id}:`, error);
		}
	}
}


