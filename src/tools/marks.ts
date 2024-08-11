import { DrizzleD1Database } from 'drizzle-orm/d1';
import { marks } from '../schema/ai';
import { z } from 'zod';
import { eq } from 'drizzle-orm';

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
	return 'Marks added';
}

export async function get_marks(robj: getMarksSchema, db: DrizzleD1Database) {
	try {
		const result = await db.select().from(marks).where(eq(robj.rollno, marks.rollno));
		return result[0].marks ? result[0] : 'No marks found';
	} catch (err) {
		return 'No marks found (internal error)';
	}
}
