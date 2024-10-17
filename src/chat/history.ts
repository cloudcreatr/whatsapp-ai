import { DrizzleD1Database } from 'drizzle-orm/d1';

import { history } from '../schema/ai';
import {  MesaagesArrayType } from './completion';

export class storeMessageDB {
	db: DrizzleD1Database;
	constructor(db: DrizzleD1Database) {
		this.db = db;
	}
	async loadMessage(Message: MesaagesArrayType) {
		const start = performance.now();
		const message = await this.db.select().from(history);
		if (message.length === 0) return;
		for (const m of message) {

			Message.push(m.message);
		}
		const end = performance.now();
		console.log(`Message Loaded: ${end - start}ms`);
	}
	async saveMessage(Message: MesaagesArrayType) {
		const start = performance.now();
		const values = Message.map((m) => ({ message: m  }));
		const res = await this.db.insert(history).values(values);
		console.log('Message Saved');
		const end = performance.now();
		console.log(`Message Saved: ${end - start}ms`);
	}
	deleteHistory = async () => {
		try {
			await this.db.delete(history);
			return 'History Deleted';
		} catch (err) {
			return 'Error in deleting history';
		}
	};
}
