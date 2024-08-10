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
		console.log('Load Message', Message);
	}
	async saveMessage(Message: OpenAI.Chat.Completions.ChatCompletionMessageParam) {
		const res = await this.db.insert(history).values({
			message: Message,
		});
		console.log('Save Message', Message);
	}
	async deleteMessage() {
		await this.db.delete(history);
	}
}
