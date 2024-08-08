import { integer, sqliteTable } from "drizzle-orm/sqlite-core";

export const marks = sqliteTable('marks', {
    rollno: integer("rollno").primaryKey(),
    marks: integer("marks"),
}) 