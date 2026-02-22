import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { eq, and, ne } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export const POST: RequestHandler = async ({ request }) => {
	const signature = request.headers.get('x-hub-signature-256');
	if (!signature) {
		throw error(401, 'Unauthorized');
	}

	const payload = await request.text();

	// In a real app, use @octokit/webhooks to verify signature
	// const webhooks = new WebhookDispatcher({ secret: ENV.GITHUB_WEBHOOK_SECRET });
	// await webhooks.verify(payload, signature);

	const event = JSON.parse(payload);
	const eventType = request.headers.get('x-github-event');

	if (eventType === 'pull_request') {
		const action = event.action;
		if (action === 'synchronize' || action === 'reopened' || action === 'edited') {
			const headSha = event.pull_request?.head?.sha;
			const prNumber = event.pull_request?.number;
			const repoOwner = event.repository?.owner?.login ?? event.repository?.owner;
			const repoName = event.repository?.name;

			if (headSha && prNumber != null && repoOwner && repoName) {
				const installationId = event.installation?.id?.toString();
				if (!installationId) return json({ ok: true });

				const repo = await db
					.select({ id: table.repos.id })
					.from(table.repos)
					.innerJoin(
						table.githubInstallations,
						eq(table.repos.installationId, table.githubInstallations.id)
					)
					.where(
						and(
							eq(table.githubInstallations.installationId, installationId),
							eq(table.repos.owner, repoOwner),
							eq(table.repos.name, repoName)
						)
					)
					.get();

				if (repo) {
					const staleSessions = await db
						.select({ id: table.reviewSessions.id })
						.from(table.reviewSessions)
						.innerJoin(
							table.pullRequests,
							eq(table.reviewSessions.pullRequestId, table.pullRequests.id)
						)
						.where(
							and(
								eq(table.pullRequests.repoId, repo.id),
								eq(table.pullRequests.number, prNumber),
								ne(table.reviewSessions.headSha, headSha)
							)
						)
						.all();

					for (const s of staleSessions) {
						await db
							.update(table.reviewSessions)
							.set({ isStale: true })
							.where(eq(table.reviewSessions.id, s.id));
					}
				}
			}
		}
	} else if (eventType === 'installation') {
		const action = event.action;
		const installationId = event.installation.id.toString();
		const accountLogin = event.installation.account.login;

		if (action === 'created' || action === 'new_permissions_accepted') {
			// Find or create a default team for this installation if needed,
			// or associate with the user who installed it.
			// For simplicity in MVP, we'll create a team per installation if none exists.

			let existingInstallation = await db
				.select()
				.from(table.githubInstallations)
				.where(eq(table.githubInstallations.installationId, installationId))
				.get();

			if (!existingInstallation) {
				const teamId = uuidv4();
				await db.insert(table.teams).values({
					id: teamId,
					name: `${accountLogin}'s Team`,
					createdAt: new Date(),
					updatedAt: new Date()
				});

				await db.insert(table.githubInstallations).values({
					id: uuidv4(),
					teamId: teamId,
					installationId: installationId,
					accountLogin: accountLogin,
					createdAt: new Date(),
					updatedAt: new Date()
				});
			}
		} else if (action === 'deleted') {
			await db
				.delete(table.githubInstallations)
				.where(eq(table.githubInstallations.installationId, installationId));
		}
	}

	return json({ ok: true });
};
