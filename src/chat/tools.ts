import { drizzle, DrizzleD1Database } from 'drizzle-orm/d1';
import { marks } from '../schema/ai';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import OpenAI from 'openai';
import { zodFunction } from 'openai/helpers/zod.mjs';

export const marks_obj = z.object({
	rollno: z.number().describe("Student's roll number"),
	marks: z.number().describe("Student's marks"),
});

export type marksObj = z.infer<typeof marks_obj>;

export const get_marks_schema = z.object({
	rollno: z.number().describe("Student's roll number"),
});

export type getMarksSchema = z.infer<typeof get_marks_schema>;

export async function add_marks(marksObj: marksObj, db: DrizzleD1Database) {
	await db.insert(marks).values({
		rollno: marksObj.rollno,
		marks: marksObj.marks,
	});
}

export async function get_marks(robj: getMarksSchema, db: DrizzleD1Database) {
	const result = await db.select().from(marks).where(eq(robj.rollno, marks.rollno));
	return result[0];
}


export const toolsArray: OpenAI.Chat.Completions.ChatCompletionTool[] = [
	zodFunction({
		name: 'add_marks',
		parameters: marks_obj,
		description: 'Add marks to the database',
	}),
	zodFunction({
		name: 'get_marks',
		parameters: get_marks_schema,
		description: 'Get marks from the database',
	}),
];