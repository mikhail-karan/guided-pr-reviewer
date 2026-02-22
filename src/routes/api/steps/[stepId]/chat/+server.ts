import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { eq, asc } from 'drizzle-orm';
import { ai, LLM_MODEL } from '$lib/server/ai/client';
import { v4 as uuidv4 } from 'uuid';
import { safeParse } from '$lib/utils';

function extractDeltaText(deltaContent: unknown): string {
	if (typeof deltaContent === 'string') return deltaContent;

	if (Array.isArray(deltaContent)) {
		return deltaContent
			.map((part) => {
				if (typeof part === 'string') return part;
				if (!part || typeof part !== 'object') return '';

				const typedPart = part as Record<string, unknown>;
				if (typeof typedPart.text === 'string') return typedPart.text;

				const nestedText = typedPart.text;
				if (nestedText && typeof nestedText === 'object') {
					const nested = nestedText as Record<string, unknown>;
					if (typeof nested.value === 'string') return nested.value;
				}

				if (typeof typedPart.content === 'string') return typedPart.content;
				return '';
			})
			.join('');
	}

	if (deltaContent && typeof deltaContent === 'object') {
		const obj = deltaContent as Record<string, unknown>;
		if (typeof obj.text === 'string') return obj.text;
		if (typeof obj.content === 'string') return obj.content;
	}

	return '';
}

function toPromptText(value: unknown): string {
	if (value === null || value === undefined) return '';
	if (typeof value === 'string') return value;
	if (typeof value === 'number' || typeof value === 'boolean') return String(value);

	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const { stepId } = params;
	const body = await request.json();
	const { message } = body;

	if (!message || typeof message !== 'string' || !message.trim()) {
		throw error(400, 'Message is required');
	}

	// Verify step exists and user has access
	const step = await db
		.select()
		.from(table.reviewSteps)
		.where(eq(table.reviewSteps.id, stepId))
		.get();

	if (!step) {
		throw error(404, 'Step not found');
	}

	// Get session to verify access
	const session = await db
		.select()
		.from(table.reviewSessions)
		.where(eq(table.reviewSessions.id, step.sessionId))
		.get();

	if (!session || session.createdByUserId !== locals.user.id) {
		throw error(403, 'Forbidden');
	}

	// Save user message
	const userMessageId = uuidv4();
	await db.insert(table.stepChatMessages).values({
		id: userMessageId,
		stepId,
		authorUserId: locals.user.id,
		role: 'user',
		content: message.trim(),
		createdAt: new Date()
	});

	// Load recent chat history (last 20 messages for context)
	const recentMessages = await db
		.select()
		.from(table.stepChatMessages)
		.where(eq(table.stepChatMessages.stepId, stepId))
		.orderBy(asc(table.stepChatMessages.createdAt))
		.all();

	// Build context from step data
	const diffHunks = safeParse<any[]>(step.diffHunksJson, []);
	const diffText = diffHunks
		.map((h) => `File: ${toPromptText(h.path)}\n${toPromptText(h.patch)}`)
		.join('\n\n');

	const aiGuidance = safeParse<{ summary: string; risks: any[]; reviewQuestions: string[] }>(
		step.aiGuidanceJson,
		null as any
	);

	const contextPack = await db
		.select()
		.from(table.contextPacks)
		.where(eq(table.contextPacks.stepId, stepId))
		.get();

	let contextPackText = '';
	if (contextPack) {
		const items = safeParse<any[]>(contextPack.itemsJson, []);
		contextPackText = items
			.map((item) => `${toPromptText(item.type)}: ${toPromptText(item.path)}\n${toPromptText(item.snippet)}`)
			.join('\n\n');
	}

	// Build system prompt with context
	const systemPrompt = `You are an expert code reviewer helping a developer understand code changes in a pull request.

You have access to:
- The code diff for this step: ${step.title} (${step.category})
- AI-generated guidance about this step
- Context from related files
- Previous conversation history

Answer questions clearly and concisely. Focus on explaining what the code does, potential issues, and best practices.`;

	// Build user prompt with context
	let userPrompt = `Step: ${step.title}
Category: ${step.category}
Complexity: ${step.complexity}

Code Diff:
\`\`\`
${diffText}
\`\`\`
`;

	if (aiGuidance?.summary) {
		userPrompt += `\n\nAI Guidance Summary:\n${toPromptText(aiGuidance.summary)}\n`;
	}

	if (aiGuidance?.risks?.length) {
		userPrompt += `\n\nPotential Risks:\n${aiGuidance.risks.map((r) => `- ${toPromptText(r?.description)}`).join('\n')}\n`;
	}

	if (contextPackText) {
		userPrompt += `\n\nRelated Context:\n\`\`\`\n${contextPackText}\n\`\`\`\n`;
	}

	// Add conversation history (last 10 messages for context, excluding the one we just added)
	const conversationHistory = recentMessages
		.slice(0, -1) // Exclude the user message we just added
		.slice(-10)
		.map((msg) => ({
			role: msg.role as 'user' | 'assistant',
			content: toPromptText(msg.content)
		}));

	userPrompt += `\n\nUser's question: ${message.trim()}`;

	// Create streaming response
	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();
			let fullResponse = '';

			try {
				const stream = await ai.chat.completions.create({
					model: LLM_MODEL,
					messages: [
						{ role: 'system', content: systemPrompt },
						...conversationHistory,
						{ role: 'user', content: userPrompt }
					],
					stream: true,
					temperature: 0.7
				});

				for await (const chunk of stream) {
					const content = extractDeltaText(chunk.choices[0]?.delta?.content);
					if (content) {
						fullResponse += content;
						controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
					}
				}

				// Save assistant response to database (only if we have content)
				if (fullResponse.trim()) {
					const assistantMessageId = uuidv4();
					await db.insert(table.stepChatMessages).values({
						id: assistantMessageId,
						stepId,
						authorUserId: locals.user.id,
						role: 'assistant',
						content: fullResponse,
						createdAt: new Date()
					});
				}
				controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
				controller.close();
			} catch (err: any) {
				console.error('Error streaming chat response:', err);

				// Preserve partial content if the stream fails mid-response.
				if (fullResponse.trim()) {
					const assistantMessageId = uuidv4();
					await db.insert(table.stepChatMessages).values({
						id: assistantMessageId,
						stepId,
						authorUserId: locals.user.id,
						role: 'assistant',
						content: fullResponse,
						createdAt: new Date()
					});
				}

				controller.enqueue(
					encoder.encode(
						`data: ${JSON.stringify({ error: err.message || 'Failed to generate response' })}\n\n`
					)
				);
				controller.close();
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
};
