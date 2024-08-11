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

export class Mark {
	private db: DrizzleD1Database;
	constructor(db: DrizzleD1Database) {
		this.db = db;
	}
	add_marks = async (marksObj: marksObj) => {
		try {
			await this.db.insert(marks).values({
				rollno: marksObj.rollno,
				marks: marksObj.marks,
			});
			return 'Marks added';
		} catch (err) {
			return 'Marks not added';
		}
	};
	get_marks = async (robj: getMarksSchema) => {
		try {
			const result = await this.db.select().from(marks).where(eq(robj.rollno, marks.rollno));
			return result[0].marks ? JSON.stringify(result[0]) : 'No marks found';
		} catch (err) {
			return 'No marks found (internal error)';
		}
	};
}


