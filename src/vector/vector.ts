import OpenAI from 'openai';
import { z } from 'zod';
type Metadata = {
	name: string;
};

export const searchSchema = z.object({
	subject: z.string().describe('The subject you want to search for'),
});

interface VectorResponse {
	matches: Array<{
		id: string;
		metadata: Metadata;
		score: number;
		values: Array<number>;
	}>;
}

export class Vector {
	private openai: OpenAI;
	private VECTOR_URL = 'https://ai-subject-h57amaf.svc.aped-4627-b74a.pinecone.io';
	private VECTOR_KEY = '3c4e2cd6-7bbb-44f2-92b4-c575b125d3f6';

	constructor({ openai }: { openai: string }) {
		this.openai = new OpenAI({
			apiKey: openai,
		});
	}

	async generateEmbedding({ text, id, metadata }: { text: string; id: string; metadata: Metadata }) {
		const vector = await this.openai.embeddings.create({
			model: 'text-embedding-3-small',
			input: text,
		});

		try {
			const response = await this.sendRequest('vectors/upsert', {
				vectors: [
					{
						id: id,
						values: vector.data[0].embedding,
						metadata: metadata,
					},
				],
			});
			return response;
		} catch (e) {
			console.log(`Error (generate): ${e}`);
		}
	}

	async sendRequest<T>(operation: string, data: any) {
		const start = performance.now();
		const response = await fetch(`${this.VECTOR_URL}/${operation}`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Api-Key': this.VECTOR_KEY,
			},
			body: JSON.stringify(data),
		});
		const end = performance.now();
		console.log(`Request took (PINECONE) ${end - start} milliseconds`)

		return response.json() as Promise<T>;
	}

	searchSubject = async ({ subject }: z.infer<typeof searchSchema>) => {
		const start = performance.now();
		const vector = await this.openai.embeddings.create({
			model: 'text-embedding-3-small',
			input: subject,
		});
		const data = await this.sendRequest<VectorResponse>('query', {
			topK: 5,
			includeMetadata: true,
			vector: vector.data[0].embedding,
		});
		const end = performance.now();
		console.log(`Request took (searcing subject) ${end - start} milliseconds`)

		return JSON.stringify(data.matches.filter((match) => match.score > 0.5) || []);
	};
}
