import { DrizzleD1Database } from 'drizzle-orm/d1';

export class HandleSQL {
	private db: DrizzleD1Database;
	constructor({ db }: { db: DrizzleD1Database }) {
		this.db = db;
	}
	executeSQL = ({ sql }: { sql: string }) => {
		console.log('SQL:', sql);
		return 'SQL executed';
	};
}
