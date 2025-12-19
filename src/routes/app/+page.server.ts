import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const installations = await db.select().from(table.githubInstallations).all();
	
	return {
		installations
	};
};

