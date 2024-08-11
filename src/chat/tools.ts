import { DrizzleD1Database } from 'drizzle-orm/d1';

import OpenAI from 'openai';
import { zodFunction } from 'openai/helpers/zod.mjs';
import { storeMessageDB } from './history';
import { ParsedFunctionToolCall } from 'openai/resources/beta/chat/completions.mjs';
import { WhatsApp } from '../messageClass';

type ToolsArray = {
	name: string;
	parameters: any;
	description: string;
	afterMessage?: string;
	beforeMessage?: string;
	function: (args: any) => Promise<string> | string;
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
				let toolsCalled = ToolsCalledArray[0];

				const tool = this.#toolsArray.find((tool) => tool.name === toolsCalled.function.name);

				if (!tool) {
					throw new Error(`Tool ${toolsCalled.function.name} not found`);
				}

				const [, tool_responce] = await Promise.allSettled([
					tool.beforeMessage ? this.#whatsapp.sendTextMessage(tool.beforeMessage) : Promise.resolve(),
					tool.function(JSON.parse(toolsCalled.function.arguments)),
				]);
				

				if (tool_responce.status === 'rejected') {
					console.log('From excute function', tool_responce.reason);
					throw tool_responce.reason;
				}
				const res = tool_responce.value;
				console.log('res', res);

				Message.push({
					role: 'assistant',
					tool_calls: ToolsCalledArray,
				});
				Message.push({
					role: 'tool',
					content: res,
					tool_call_id: toolsCalled.id,
				});

				// const test2 = {
				// 	tool_calls: ToolsCalledArray,
				// 	the_tool_excuting: toolsCalled,
				// 	tool_responce: res,

				// };

				// console.log('test2', JSON.stringify(test2, null, 2));

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

				const toolchatresp = {
					tools: tools,
					message: message,
				
				}

				console.log('toolchatresp', JSON.stringify(toolchatresp, null, 2));

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
					this.#whatsapp.sendTextMessage('_No response from the AI_');
				}
			}
		} catch (error) {
			console.log('execute Tool', error);
		}
	}
}
