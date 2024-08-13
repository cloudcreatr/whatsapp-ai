import OpenAI from 'openai';
import { Tools, ToolsArray } from '../chat/tools';
import { storeMessageDB } from './history';
import { DrizzleD1Database } from 'drizzle-orm/d1';
import { Message } from './completion';

export class handleMessage {
	private executeTools: InstanceType<typeof Tools>;
	private openai: InstanceType<typeof OpenAI>;
	private db: DrizzleD1Database;
	private storeMessage: InstanceType<typeof storeMessageDB>;
	constructor({ db, openaikey, toolsArray }: { db: DrizzleD1Database, openaikey: string }) {
        this.db = db;
		this.openai = new OpenAI({
            apiKey: openaikey,
        });
		this.storeMessage = new storeMessageDB(db);
		this.executeTools = new Tools();
	}
	handleText = async (text: string) => {};
}
