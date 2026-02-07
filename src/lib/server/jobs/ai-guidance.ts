import { db } from '../db';
import * as table from '../db/schema';
import { eq, asc } from 'drizzle-orm';
import { ai, LLM_MODEL } from '../ai/client';
import { safeParse } from '../../utils';

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
								{
									"description": "Specific risk or concern",
									"severity": "low|medium|high",
									"lines": [{ "path": "path/to/file.ts", "startLine": 10, "endLine": 15 }]
								}
							],
							"reviewQuestions": ["list", "of", "questions", "the", "reviewer", "should", "answer"]
						}
						
						For each risk, the "lines" array should reference the specific lines in the diff that are relevant to that risk. Use the file paths and line numbers from the diff hunks (the +N line numbers from @@ headers). Each entry needs "path" (the file path), "startLine" and "endLine" (the line range in the new file). If a risk is general and not tied to specific lines, use an empty array for "lines".`
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

				// 3. Generate Inline Hunk Explanations
				try {
					const inlineExplanations: Array<{
						hunkIndex: number;
						path: string;
						lineRange: string;
						explanation: string;
					}> = [];

					// Parse each file's patch to find all actual hunks
					let globalHunkIndex = 0;
					for (const fileHunk of diffHunks) {
						if (!fileHunk || !fileHunk.patch) continue;

						// Split patch into individual hunks (each starts with @@)
						// Match hunks more flexibly - handle different line endings and whitespace
						const hunkMatches = fileHunk.patch.matchAll(/@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@[\r\n]+([\s\S]*?)(?=@@|$)/g);
						const hunks = Array.from(hunkMatches);

						if (hunks.length === 0) {
							// If no hunks found, treat the whole patch as one hunk
							const lineRangeMatch = fileHunk.patch.match(/@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/);
							const lineRange = lineRangeMatch
								? `L${lineRangeMatch[3]}-${lineRangeMatch[4] ? parseInt(lineRangeMatch[3]) + parseInt(lineRangeMatch[4]) - 1 : lineRangeMatch[3]}`
								: '';

							const explanationResponse = await ai.chat.completions.create({
								model: LLM_MODEL,
								messages: [
									{
										role: 'system',
										content: `You are an expert code reviewer. Provide a brief, clear explanation (1-3 sentences) of what this code diff hunk accomplishes. Focus on the "what" and "why" - explain the purpose and intent of the changes, not a line-by-line description. Be concise and helpful for code reviewers.`
									},
									{
										role: 'user',
										content: `File: ${fileHunk.path}\n${lineRange ? `Lines: ${lineRange}\n` : ''}Diff hunk:\n\`\`\`\n${fileHunk.patch}\n\`\`\``
									}
								],
								max_tokens: 150,
								temperature: 0.3
							});

							const explanation = explanationResponse.choices[0].message.content?.trim() || '';
							if (explanation) {
								inlineExplanations.push({
									hunkIndex: globalHunkIndex++,
									path: fileHunk.path,
									lineRange,
									explanation
								});
							}
						} else {
							// Process each hunk separately
							for (const match of hunks) {
								const [, oldStart, oldCount, newStart, newCount, hunkContent] = match;
								const lineRange = `L${newStart}-${newCount ? parseInt(newStart) + parseInt(newCount) - 1 : newStart}`;
								const hunkPatch = `@@ -${oldStart}${oldCount ? ',' + oldCount : ''} +${newStart}${newCount ? ',' + newCount : ''} @@\n${hunkContent}`;

								const explanationResponse = await ai.chat.completions.create({
									model: LLM_MODEL,
									messages: [
										{
											role: 'system',
											content: `You are an expert code reviewer. Provide a brief, clear explanation (1-3 sentences) of what this code diff hunk accomplishes. Focus on the "what" and "why" - explain the purpose and intent of the changes, not a line-by-line description. Be concise and helpful for code reviewers.`
										},
										{
											role: 'user',
											content: `File: ${fileHunk.path}\nLines: ${lineRange}\nDiff hunk:\n\`\`\`\n${hunkPatch}\n\`\`\``
										}
									],
									max_tokens: 150,
									temperature: 0.3
								});

								const explanation = explanationResponse.choices[0].message.content?.trim() || '';
								if (explanation) {
									inlineExplanations.push({
										hunkIndex: globalHunkIndex++,
										path: fileHunk.path,
										lineRange,
										explanation
									});
								}
							}
						}
					}

					if (inlineExplanations.length > 0) {
						await db
							.update(table.reviewSteps)
							.set({
								aiInlineExplanationsJson: JSON.stringify(inlineExplanations),
								updatedAt: new Date()
							})
							.where(eq(table.reviewSteps.id, step.id));
					}
				} catch (error) {
					console.error(`Error generating inline explanations for step ${step.id}:`, error);
				}
			}
		} catch (error) {
			console.error(`Error generating guidance for step ${step.id}:`, error);
		}
	}
}


