import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { MessagesType } from '../chat/completion';

export const marks = sqliteTable('marks', {
	rollno: integer('rollno').primaryKey(),
	marks: integer('marks'),
});

export const history = sqliteTable('history', {
	message: text('message', {
		mode: 'json',
	})
		.$type<MessagesType>()
		.notNull(),
});
