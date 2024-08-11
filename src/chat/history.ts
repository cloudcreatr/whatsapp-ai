import { DrizzleD1Database } from 'drizzle-orm/d1';
import OpenAI from 'openai';
import { history } from '../schema/ai';

export class storeMessageDB {
	db: DrizzleD1Database;
	constructor(db: DrizzleD1Database) {
		this.db = db;
	}
	async loadMessage(Message: OpenAI.Chat.Completions.ChatCompletionMessageParam[]) {
		const message = await this.db.select().from(history);
		if (message.length === 0) return;
		for (const m of message) {
			Message.push(m.message);
		}
	}
	async saveMessage(Message: OpenAI.Chat.Completions.ChatCompletionMessageParam[]) {
		const values = Message.map((m) => ({ message: m }));
		const res = await this.db.insert(history).values(values);
		console.log('Message Saved');
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
