import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import OpenAI from 'openai';

export const marks = sqliteTable('marks', {
	rollno: integer('rollno').primaryKey(),
	marks: integer('marks'),
});

export const history = sqliteTable('history', {
	message: text('message', {
		mode: 'json',
	})
		.$type<OpenAI.Chat.Completions.ChatCompletionMessageParam>()
		.notNull(),
});
