import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import { ENV } from '../env';

let client: Database.Database;

export const db = {
	get instance() {
		if (!client) {
			client = new Database(ENV.DATABASE_URL);
		}
		return drizzle(client, { schema });
	},
	select: (...args: any[]) => db.instance.select(...args),
	insert: (...args: any[]) => db.instance.insert(...args),
	update: (...args: any[]) => db.instance.update(...args),
	delete: (...args: any[]) => db.instance.delete(...args),
} as unknown as ReturnType<typeof drizzle<typeof schema>>;

