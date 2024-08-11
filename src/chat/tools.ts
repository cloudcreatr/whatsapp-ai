import { drizzle, DrizzleD1Database } from 'drizzle-orm/d1';
import { marks } from '../schema/ai';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import OpenAI from 'openai';
import { zodFunction } from 'openai/helpers/zod.mjs';
import { storeMessageDB } from './history';
import { ParsedFunctionToolCall } from 'openai/resources/beta/chat/completions.mjs';
import { WhatsApp } from '../messageClass';
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

type ToolsArray = {
	name: string;
	parameters: any;
	description: string;
	function: (args: any, db: DrizzleD1Database) => Promise<string>;
}[];

export class Tools {
	#toolsArray: ToolsArray;
	#db: DrizzleD1Database;
	#Message: OpenAI.Chat.Completions.ChatCompletionMessageParam[];

	#openai: OpenAI;
	#whatsapp: WhatsApp;

	constructor(
		toolsArray: ToolsArray,
		db: DrizzleD1Database,
		Message: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
		openaiKey: string,

		whatsapp: WhatsApp
	) {
		this.#toolsArray = toolsArray;
		this.#db = db;
		this.#Message = Message;

		this.#whatsapp = whatsapp;
		this.#openai = new OpenAI({ apiKey: openaiKey });
	}
	genrateTools() {
		const generatedToolsArray: OpenAI.Chat.Completions.ChatCompletionTool[] = [];
		this.#toolsArray.forEach((tool) => {
			generatedToolsArray.push(
				zodFunction({
					name: tool.name,
					parameters: tool.parameters,
					description: tool.description,
					
				})
			);
		});
		return generatedToolsArray;
	}
	async executeTools(toolsCall: ParsedFunctionToolCall[]) {
		try {
			let ToolsCalledArray = toolsCall;
			const storeMessage = new storeMessageDB(this.#db);
			const Message = this.#Message;
			while (ToolsCalledArray.length > 0) {
				console.log('ToolsCalledArray', ToolsCalledArray);
				let toolsCalled = ToolsCalledArray[0];
				console.log('toolsCalled id', toolsCalled.id);
				console.log('toolsCalled', toolsCalled);
				const tool = this.#toolsArray.find((tool) => tool.name === toolsCalled.function.name);

				if (!tool) {
					throw new Error(`Tool ${toolsCalled.function.name} not found`);
				}
				const res = await tool.function(JSON.parse(toolsCalled.function.arguments), this.#db);
				console.log('Response of Tool:', res);

				Message.push({
					role: 'assistant',
					tool_calls: ToolsCalledArray,
				});
				Message.push({
					role: 'tool',
					content: res,
					tool_call_id: toolsCalled.id,
				});

				const test2 = {
					tool_calls: ToolsCalledArray,
					the_tool_excuting: toolsCalled,
					tool_responce: res,
					
				};

				console.log('test2', JSON.stringify(test2, null, 2));

				const [, , ChatPromise] = await Promise.allSettled([
					storeMessage.saveMessage({
						role: 'assistant',
						tool_calls: ToolsCalledArray,
					}),
					storeMessage.saveMessage({
						role: 'tool',
						content: res,
						tool_call_id: toolsCalled.id,
					}),
					this.#openai.chat.completions.create({
						model: 'gpt-4o-mini-2024-07-18',
						messages: this.#Message,
						parallel_tool_calls: false,
						tools: this.genrateTools(),
					}),
				]);
				if (ChatPromise.status === 'rejected') {
					console.log('From excute function', ChatPromise.reason);
					throw ChatPromise.reason;
				}
				const Chat = ChatPromise.value;
				const tools = Chat.choices[0].message.tool_calls;
				const message = Chat.choices[0].message.content;
				console.log('message from excute tool', message);
				if (tools) {
					if (message) {
						this.#Message.push({
							role: 'assistant',
							content: message,
						});
						await Promise.allSettled([
							this.#whatsapp.sendTextMessage(message),
							storeMessage.saveMessage({
								role: 'assistant',
								content: message,
							}),
						]);
					} else {
						this.#whatsapp.sendTextMessage('No response from the AI  (next loop)');
					}
					
					console.log('tools another loop', tools);
					ToolsCalledArray = tools;
					continue;
				}
				
				ToolsCalledArray = [];
				if (message) {
					this.#Message.push({
						role: 'assistant',
						content: message,
					});
					await Promise.allSettled([
						this.#whatsapp.sendTextMessage(message),
						storeMessage.saveMessage({
							role: 'assistant',
							content: message,
						}),
					]);
				} else {
					this.#whatsapp.sendTextMessage('No response from the AI');
				}
			}
		} catch (error) {
			console.log('execute Tool', error);
		}
	}
}
