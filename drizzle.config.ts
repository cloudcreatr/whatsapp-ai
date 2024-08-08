import { defineConfig } from 'drizzle-kit';
export default defineConfig({
	dialect: "sqlite", // "mysql" | "sqlite" | "postgresql"
	schema: './src/schema/ai.ts',
	out: './migrations',
});
