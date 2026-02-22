import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';
import { ENV } from '$lib/server/env';
import { getAppOctokit, getUserOctokit } from '$lib/server/auth/github';
import { v4 as uuidv4 } from 'uuid';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ url, locals }) => {
	const installationIdParam = url.searchParams.get('installation_id');

	const log = (msg: string, data?: any) => {
		console.log(`[Dashboard] ${msg}`, data ? JSON.stringify(data) : '');
	};

	log('Dashboard load entry', { userId: locals.user?.id, installationIdParam });

	// 1. Sync helper
	const syncInstallation = async (instId: string, accountLogin: string) => {
		try {
			const existing = await db
				.select()
				.from(table.githubInstallations)
				.where(eq(table.githubInstallations.installationId, instId))
				.get();

			if (!existing) {
				log(`Syncing missing installation: ${instId} (${accountLogin})`);
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
					installationId: instId,
					accountLogin: accountLogin,
					createdAt: new Date(),
					updatedAt: new Date()
				});

				if (locals.user) {
					await db.insert(table.teamMembers).values({
						teamId: teamId,
						userId: locals.user.id,
						role: 'owner'
					});
				}
				log(`Successfully synced ${accountLogin}`);
			}
		} catch (e: any) {
			log(`Failed to sync installation ${instId}: ${e.message}`);
		}
	};

	// 2. Discovery from App Identity (Most reliable)
	try {
		log('Starting App-level discovery...');
		const appOctokit = getAppOctokit();
		const { data: installations } = await appOctokit.apps.listInstallations({ per_page: 100 });
		log(`App Identity found ${installations.length} total installations`, {
			logins: installations.map((i) => i.account?.login)
		});

		for (const inst of installations) {
			await syncInstallation(inst.id.toString(), (inst.account as any)?.login || 'unknown');
		}
	} catch (err: any) {
		log('App-level discovery failed', { error: err.message, stack: err.stack?.split('\n')[0] });
	}

	// 3. Discovery from User Token (To link user to installations)
	if (locals.user?.accessTokenEncrypted) {
		try {
			log('Starting User-level discovery...');
			const userOctokit = getUserOctokit(locals.user.accessTokenEncrypted);
			const {
				data: { installations }
			} = await userOctokit.apps.listInstallationsForAuthenticatedUser();
			log(`User Token found ${installations.length} accessible installations`, {
				logins: installations.map((i) => i.account?.login)
			});

			for (const inst of installations) {
				await syncInstallation(inst.id.toString(), (inst.account as any)?.login || 'unknown');
			}
		} catch (err: any) {
			if (err.status === 401) {
				log('User token expired or invalid (401). Discovery skipped.');
			} else {
				log('User-level discovery failed', { error: err.message });
			}
		}
	}

	const installations = await db.select().from(table.githubInstallations).all();
	log('Final installations in DB', {
		count: installations.length,
		logins: installations.map((i) => i.accountLogin)
	});

	return {
		installations,
		githubAppName: ENV.GITHUB_APP_NAME,
		userTokenValid: !locals.user || !!locals.user.accessTokenEncrypted // Simple check
	};
};
