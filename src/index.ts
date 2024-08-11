import { Hono } from 'hono';
import { confirmMessageSchema, WhatsApp } from './messageClass';
import OpenAI from 'openai/index.mjs';
import { drizzle } from 'drizzle-orm/d1';

import { returnAudioFile } from './util/audioProcess';
import { isAudio } from './util/util';
import { webhookComponent } from './webhokkComponents';
import { Message } from './chat/completion';
import { Tools } from './chat/tools';
import { Mark, get_marks_schema, marks_obj } from './tools/marks';
import { z } from 'zod';
import { storeMessageDB } from './chat/history';

const app = new Hono<{
	Bindings: Env;
}>();

app.get('/message', async (c) => {
	// const message = c.req.query('m');
	// if (!message) {
	// 	return c.text('Invalid request', 400);
	// }
	// const whatsapp = new WhatsApp('917666235448', c.env['wa-id'], c.env['wa-token']);
	// await whatsapp.comfirmMessage({
	// 	option1: 'yes om',
	// 	option2: 'no om',
	// 	body: 'Do you want to continue?',
	// });
	// return c.json('sucess', 200);
});

app.get('/', async (c) => {
	const hub_challenge = c.req.query('hub.challenge');
	const hub_verify_token = c.req.query('hub.verify_token');
	if (!hub_challenge || !hub_verify_token) {
		return c.text('Invalid request', 400);
	}
	if (hub_verify_token === c.env.hub.verify_token) {
		return c.text(hub_challenge, 200);
	}
});

app.post('/', async (c) => {
	try {
		const payload: webhookComponent = await c.req.json();

		const messagearr = payload.entry[0].changes[0].value.messages;
		const whatsapp = new WhatsApp(payload.entry[0].changes[0].value.contacts[0].wa_id, c.env['wa-id'], c.env['wa-token']);
		const db = drizzle(c.env.DB);
		const messageDB = new storeMessageDB(db);
		const openai = new OpenAI({
			apiKey: c.env.openai,
		});
		const mark = new Mark(db);

		
		if (messagearr && messagearr[0]) {
			const text = messagearr[0].text?.body;
			const interactive = messagearr[0].interactive;
			if (isAudio(messagearr)) {
				const audioObj = messagearr[0].audio;
				if (audioObj) {
					const mark = new Mark(db);
					const executeTools = new Tools(
						[
							{
								name: 'add_marks',
								parameters: marks_obj,
								description: 'Add marks to the database',
								beforeMessage: '_adding marks to database_',
								function: mark.add_marks,
							},
							{
								name: 'get_marks',
								parameters: get_marks_schema,
								description: 'Get marks from the database',
								beforeMessage: '_getting marks from database_',
								function: mark.get_marks,
							},
							{
								name: 'deleteHistory',
								description: 'call this tool to Delete the history of the chat, this will make you forget evrything',
								parameters: z.object({}),
								beforeMessage: '_deleting history_',
								function: messageDB.deleteHistory,
							},
							{
								name: 'comfirmMessage',
								parameters: confirmMessageSchema,
								description:
									'Send a message with two buttons, option1 has string, that user will click and option2 has string, that user will click',
								function: whatsapp.comfirmMessage,
							},
						],
						db,
						Message,
						c.env.openai,
						whatsapp
					);

					const [, , audioPromise] = await Promise.allSettled([
						whatsapp.markAsRead(messagearr[0].id),
						whatsapp.sendReaction(messagearr[0].id, '\uD83D\uDD04'),
						whatsapp.getAudio(audioObj.id),
						messageDB.loadMessage(Message),
					]);

					if (audioPromise.status === 'rejected') {
						await whatsapp.sendTextMessage('Failed to get audio');
						return c.json('sucess', 200);
					}

					const file = await returnAudioFile(audioPromise.value.arrayBuffer());

					const [, texttranscriptPromise] = await Promise.allSettled([
						whatsapp.sendTextMessage('_Transcribing audio..._'),
						openai.audio.transcriptions.create({
							file,
							model: 'whisper-1',
						}),
					]);

					if (texttranscriptPromise.status === 'rejected') {
						await whatsapp.sendTextMessage('_Failed to transcribe audio_');
						return c.json('sucess', 200);
					}

					const texttranscript = texttranscriptPromise.value;
					console.log(`TTS : ${texttranscript.text}`);
					const text = texttranscript.text;

					Message.push({
						role: 'user',
						content: text,
					});

					const [, completionPromise] = await Promise.allSettled([
						whatsapp.sendTextMessage('_thinking..._'),
						openai.beta.chat.completions.parse({
							messages: Message,
							tools: executeTools.genrateTools(),
							model: 'gpt-4o-mini-2024-07-18',
							parallel_tool_calls: false,
						}),
						messageDB.saveMessage({ role: 'user', content: text }),
					]);

					if (completionPromise.status === 'rejected') {
						console.log(completionPromise.reason);
						await Promise.allSettled([
							whatsapp.sendTextMessage(' failed to get response from outer'),
							whatsapp.sendTextMessage(completionPromise.reason),
						]);

						return c.json('sucess', 200);
					}
					const completion = completionPromise.value;
					const tools = completion.choices[0].message.tool_calls;

					if (tools.length > 0) {
						await executeTools.executeTools(tools);
						console.log('Message (tool)', JSON.stringify(Message, null, 2));
						return c.json('sucess', 200);
					}
					const message = completion.choices[0].message.content;

					if (message) {
						await Promise.allSettled([whatsapp.sendTextMessage(message), messageDB.saveMessage({ role: 'assistant', content: message })]);
						Message.push({
							role: 'assistant',
							content: message,
						});
						console.log('Message (text)', JSON.stringify(Message, null, 2));
					} else {
						await whatsapp.sendTextMessage('_No response from the model_');
					}
				}
			} else if (text) {
				const executeTools = new Tools(
					[
						{
							name: 'add_marks',
							parameters: marks_obj,
							description: 'Add marks to the database',
							beforeMessage: '_adding marks to database_',
							function: mark.add_marks,
						},
						{
							name: 'get_marks',
							parameters: get_marks_schema,
							description: 'Get marks from the database',
							beforeMessage: '_getting marks from database_',
							function: mark.get_marks,
						},
						{
							name: 'deleteHistory',
							description: 'call this tool to Delete the history of the chat, this will make you forget evrything',
							parameters: z.object({}),
							beforeMessage: '_deleting history_',
							function: messageDB.deleteHistory,
						},
						{
							name: 'comfirmMessage',
							parameters: confirmMessageSchema,
							description:
								'Send a message with two buttons, option1 has string, that user will click and option2 has string, that user will click',
							function: whatsapp.comfirmMessage,
						},
					],
					db,
					Message,
					c.env.openai,
					whatsapp
				);

				await Promise.allSettled([
					whatsapp.markAsRead(messagearr[0].id),
					whatsapp.sendReaction(messagearr[0].id, '\uD83D\uDD04'),
					messageDB.loadMessage(Message),
				]);

				console.log('text', text);

				Message.push({
					role: 'user',
					content: text,
				});

				const [, completionPromise] = await Promise.allSettled([
					whatsapp.sendTextMessage('_thinking..._'),
					openai.beta.chat.completions.parse({
						messages: Message,
						tools: executeTools.genrateTools(),
						model: 'gpt-4o-mini-2024-07-18',
						parallel_tool_calls: false,
					}),
					messageDB.saveMessage({ role: 'user', content: text }),
				]);

				if (completionPromise.status === 'rejected') {
					console.log(completionPromise.reason);
					await Promise.allSettled([
						whatsapp.sendTextMessage(' failed to get response from outer'),
						whatsapp.sendTextMessage(completionPromise.reason),
					]);

					return c.json('sucess', 200);
				}
				const completion = completionPromise.value;
				const tools = completion.choices[0].message.tool_calls;

				if (tools.length > 0) {
					await executeTools.executeTools(tools);
					console.log('Message (tool)', JSON.stringify(Message, null, 2));
					return c.json('sucess', 200);
				}
				const message = completion.choices[0].message.content;
				console.log('message ai', message);
				if (message) {
					await Promise.allSettled([whatsapp.sendTextMessage(message), messageDB.saveMessage({ role: 'assistant', content: message })]);
					Message.push({
						role: 'assistant',
						content: message,
					});
					console.log('Message (text)', JSON.stringify(Message, null, 2));
				} else {
					await whatsapp.sendTextMessage('No response from the model');
				}
			} else if (interactive && interactive.type === 'button_reply') {
				const buttonObject = interactive.button_reply;
				console.log('buttonObject', buttonObject);
				if (buttonObject) {
					const executeTools = new Tools(
						[
							{
								name: 'add_marks',
								parameters: marks_obj,
								description: 'Add marks to the database',
								beforeMessage: '_adding marks to database_',
								function: mark.add_marks,
							},
							{
								name: 'get_marks',
								parameters: get_marks_schema,
								description: 'Get marks from the database',
								beforeMessage: '_getting marks from database_',
								function: mark.get_marks,
							},
							{
								name: 'deleteHistory',
								description: 'call this tool to Delete the history of the chat, this will make you forget evrything',
								parameters: z.object({}),
								beforeMessage: '_deleting history_',
								function: messageDB.deleteHistory,
							},
							{
								name: 'comfirmMessage',
								parameters: confirmMessageSchema,
								description:
									'Send a message with two buttons, option1 has string, that user will click and option2 has string, that user will click',
								function: whatsapp.comfirmMessage,
							},
						],
						db,
						Message,
						c.env.openai,
						whatsapp
					);

					await Promise.allSettled([
						whatsapp.markAsRead(messagearr[0].id),
						whatsapp.sendReaction(messagearr[0].id, '\uD83D\uDD04'),
						messageDB.loadMessage(Message),
					]);

					const text = buttonObject.title;
					Message.push({
						role: 'user',
						content: buttonObject.title,
					});
					const [, completionPromise] = await Promise.allSettled([
						whatsapp.sendTextMessage('_thinking..._'),
						openai.beta.chat.completions.parse({
							messages: Message,
							tools: executeTools.genrateTools(),
							model: 'gpt-4o-mini-2024-07-18',
							parallel_tool_calls: false,
						}),
						messageDB.saveMessage({ role: 'user', content: text }),
					]);

					if (completionPromise.status === 'rejected') {
						console.log(completionPromise.reason);
						await Promise.allSettled([
							whatsapp.sendTextMessage(' failed to get response from outer'),
							whatsapp.sendTextMessage(completionPromise.reason),
						]);

						return c.json('sucess', 200);
					}
					const completion = completionPromise.value;
					const tools = completion.choices[0].message.tool_calls;

					if (tools.length > 0) {
						await executeTools.executeTools(tools);
						console.log('Message (tool)', JSON.stringify(Message, null, 2));
						return c.json('sucess', 200);
					}
					const message = completion.choices[0].message.content;
					console.log('message ai', message);
					if (message) {
						await Promise.allSettled([whatsapp.sendTextMessage(message), messageDB.saveMessage({ role: 'assistant', content: message })]);
						Message.push({
							role: 'assistant',
							content: message,
						});
						console.log('Message (text)', JSON.stringify(Message, null, 2));
						
					} else {
						await whatsapp.sendTextMessage('No response from the model');
					}
				}
			}
		}
	} catch (e) {
		console.log(e);
	}
	return c.json('sucess', 200);
});

export default app;
