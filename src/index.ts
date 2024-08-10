import { Hono } from 'hono';
import { WhatsApp } from './messageClass';
import OpenAI from 'openai/index.mjs';
import { drizzle } from 'drizzle-orm/d1';

import { returnAudioFile } from './util/audioProcess';
import { isAudio } from './util/util';
import { webhookComponent } from './webhokkComponents';
import { Message } from './chat/completion';
import { add_marks, get_marks, get_marks_schema, marks_obj, toolsArray } from './chat/tools';
import { zodFunction } from 'openai/helpers/zod.mjs';
import { storeMessageDB } from './chat/history';

const app = new Hono<{
	Bindings: Env;
}>();

// app.get('/message', async (c) => {
// 	const message = c.req.query('m');
// 	if (!message) {
// 		return c.text('Invalid request', 400);
// 	}
// 	const whatsapp = new WhatsApp('917666235448', c.env['wa-id'], c.env['wa-token']);
// 	await whatsapp.sendTextMessage(message);
// 	return c.json('sucess', 200);
// });

app.get('/', async (c) => {
	const hub_challenge = c.req.query('hub.challenge');
	const hub_verify_token = c.req.query('hub.verify_token');
	if (!hub_challenge || !hub_verify_token) {
		return c.text('Invalid request', 400);
	}
	if (hub_verify_token === c.env['hub.verify_token']) {
		return c.text(hub_challenge, 200);
	}
});

app.post('/', async (c) => {
	try {
		const payload: webhookComponent = await c.req.json();

		const messagearr = payload.entry[0].changes[0].value.messages;

		if (messagearr) {
			if (isAudio(messagearr)) {
				const audioObj = messagearr[0].audio;
				if (audioObj) {
					const whatsapp = new WhatsApp(payload.entry[0].changes[0].value.contacts[0].wa_id, c.env['wa-id'], c.env['wa-token']);
					const messageDB = new storeMessageDB(drizzle(c.env.DB));

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

					const openai = new OpenAI({
						apiKey: c.env.openai,
					});

					const [, texttranscriptPromise] = await Promise.allSettled([
						whatsapp.sendTextMessage('Transcribing audio...'),
						openai.audio.transcriptions.create({
							file,
							model: 'whisper-1',
						}),
					]);

					if (texttranscriptPromise.status === 'rejected') {
						await whatsapp.sendTextMessage('Failed to transcribe audio');
						return c.json('sucess', 200);
					}

					const texttranscript = texttranscriptPromise.value;
					console.log(`TTS : ${texttranscript.text}`);

					Message.push({
						role: 'user',
						content: texttranscript.text,
					});

					const [, completionPromise] = await Promise.allSettled([
						whatsapp.sendTextMessage('thinking...'),
						openai.chat.completions.create({
							model: 'gpt-4o-mini-2024-07-18',
							messages: Message,
							tools: toolsArray,
						}),
						messageDB.saveMessage({ role: 'user', content: texttranscript.text }),
					]);
					if (completionPromise.status === 'rejected') {
						console.log(completionPromise.reason);
						await whatsapp.sendTextMessage('Failed to get response from model');
						return c.json('sucess', 200);
					}

					const completion = completionPromise.value;
					const tools = completion.choices[0].message.tool_calls;

					if (tools) {
						for (const tool of tools) {
							if (tool.function.name === 'add_marks') {
								const params = marks_obj.parse(JSON.parse(tool.function.arguments));
								const db = drizzle(c.env.DB);
								await Promise.allSettled([whatsapp.sendTextMessage('Adding marks to the database'), add_marks(params, db)]);
								Message.push({ role: 'assistant', tool_calls: tools });
								Message.push({ role: 'tool', content: 'Added marks of student', tool_call_id: tool.id });
								const chat = await openai.chat.completions.create({
									messages: Message,

									model: 'gpt-4o-mini-2024-07-18',
								});
								const message2 = chat.choices[0].message.content;
								if (message2) {
									await whatsapp.sendTextMessage(message2);
									return c.json('sucess', 200);
								} else {
									await whatsapp.sendTextMessage('No response from the model');
									return c.json('sucess', 200);
								}
							} else if (tool.function.name === 'get_marks') {
								const params = get_marks_schema.parse(JSON.parse(tool.function.arguments));
								const db = drizzle(c.env.DB);
								const [, marksPromise] = await Promise.allSettled([
									whatsapp.sendTextMessage('Searching for the marks for the student'),
									get_marks(params, db),
								]);
								if (marksPromise.status === 'rejected') {
									console.log(marksPromise.reason);
									await whatsapp.sendTextMessage('Failed to get marks');
									return c.json('sucess', 200);
								}
								Message.push({ role: 'assistant', tool_calls: tools });
								Message.push({
									role: 'tool',
									content: JSON.stringify(marksPromise.value ? marksPromise.value : 'Roll No not found'),
									tool_call_id: tool.id,
								});
								const chat = await openai.chat.completions.create({
									messages: Message,

									model: 'gpt-4o-mini-2024-07-18',
								});
								const message = chat.choices[0].message.content;
								if (message) {
									await whatsapp.sendTextMessage(message);
									return c.json('sucess', 200);
								} else {
									await whatsapp.sendTextMessage('No response from the model');
									return c.json('sucess', 200);
								}
							}
						}
					}
					const message = completion.choices[0].message.content;

					if (message) {
						await Promise.allSettled([whatsapp.sendTextMessage(message), messageDB.saveMessage({ role: 'assistant', content: message })]);
					} else {
						await whatsapp.sendTextMessage('No response from the model');
					}
				}
			} else {
				const text = messagearr[0].text?.body;
				if (text) {
					const messageDB = new storeMessageDB(drizzle(c.env.DB));

					const whatsapp = new WhatsApp(payload.entry[0].changes[0].value.contacts[0].wa_id, c.env['wa-id'], c.env['wa-token']);
					await Promise.allSettled([
						whatsapp.markAsRead(messagearr[0].id),
						whatsapp.sendReaction(messagearr[0].id, '\uD83D\uDD04'),

						messageDB.loadMessage(Message),
					]);

					const openai = new OpenAI({
						apiKey: c.env.openai,
					});

					Message.push({
						role: 'user',
						content: text,
					});

					const [, completionPromise] = await Promise.allSettled([
						whatsapp.sendTextMessage('thinking...'),
						openai.beta.chat.completions.parse({
							messages: Message,
							tools: [
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
							],
							model: 'gpt-4o-mini-2024-07-18',
						}),
						messageDB.saveMessage({ role: 'user', content: text }),
					]);

					if (completionPromise.status === 'rejected') {
						await whatsapp.sendTextMessage('Failed to get response from model');
						return c.json('sucess', 200);
					}
					const completion = completionPromise.value;
					const tools = completion.choices[0].message.tool_calls;
					console.log('tools', tools);

					if (tools) {
						for (const tool of tools) {
							if (tool.function.name === 'add_marks') {
								const params = marks_obj.parse(JSON.parse(tool.function.arguments));
								const db = drizzle(c.env.DB);
								await Promise.allSettled([whatsapp.sendTextMessage('Adding marks to the database'), add_marks(params, db)]);
								Message.push({ role: 'assistant', tool_calls: tools });
								Message.push({ role: 'tool', content: 'Added marks of student', tool_call_id: tool.id });
								console.log('tool call', JSON.stringify(Message));
								const chat = await openai.chat.completions.create({
									messages: Message,

									model: 'gpt-4o-mini-2024-07-18',
								});
								const message2 = chat.choices[0].message.content;
								if (message2) {
									await whatsapp.sendTextMessage(message2);
									return c.json('sucess', 200);
								} else {
									await whatsapp.sendTextMessage('No response from the model');
									return c.json('sucess', 200);
								}
							} else if (tool.function.name === 'get_marks') {
								const params = get_marks_schema.parse(JSON.parse(tool.function.arguments));
								const db = drizzle(c.env.DB);
								const [, marksPromise] = await Promise.allSettled([
									whatsapp.sendTextMessage('Searching for the marks for the student'),
									get_marks(params, db),
								]);
								if (marksPromise.status === 'rejected') {
									console.log(marksPromise.reason);
									await whatsapp.sendTextMessage('Failed to get marks');
									return c.json('sucess', 200);
								}
								Message.push({ role: 'assistant', tool_calls: tools });
								Message.push({
									role: 'tool',
									content: JSON.stringify(marksPromise.value ? marksPromise.value : 'Roll No not found'),
									tool_call_id: tool.id,
								});
								const chat = await openai.chat.completions.create({
									messages: Message,

									model: 'gpt-4o-mini-2024-07-18',
								});
								const message = chat.choices[0].message.content;
								if (message) {
									await whatsapp.sendTextMessage(message);
									return c.json('sucess', 200);
								} else {
									await whatsapp.sendTextMessage('No response from the model');
									return c.json('sucess', 200);
								}
							}
						}
					}
					const message = completion.choices[0].message.content;
					if (message) {
						await Promise.allSettled([whatsapp.sendTextMessage(message), messageDB.saveMessage({ role: 'assistant', content: message })]);
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
