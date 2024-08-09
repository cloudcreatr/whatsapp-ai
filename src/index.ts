import { Hono } from 'hono';
import { WhatsApp } from './messageClass';
import OpenAI from 'openai/index.mjs';
import { drizzle, DrizzleD1Database } from 'drizzle-orm/d1';
import { marks } from './schema/ai';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { zodFunction } from 'openai/helpers/zod.mjs';

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
			if (messagearr[0].type === 'audio') {
				const audioObj = messagearr[0].audio;
				if (audioObj) {
					const whatsapp = new WhatsApp(payload.entry[0].changes[0].value.contacts[0].wa_id, c.env['wa-id'], c.env['wa-token']);
					const [, , audioPromise] = await Promise.allSettled([
						whatsapp.markAsRead(messagearr[0].id),
						whatsapp.sendReaction(messagearr[0].id, '\uD83D\uDD04'),
						whatsapp.getAudio(audioObj.id),
					]);

					if (audioPromise.status === 'rejected') {
						await whatsapp.sendTextMessage('Failed to get audio');
						return c.json('sucess', 200);
					}

					const audioResponse = audioPromise.value;

					// Get the audio data as an ArrayBuffer
					const audioArrayBuffer = await audioResponse.arrayBuffer();

					const openai = new OpenAI({
						apiKey: c.env.openai,
					});

					// Create a File object from the ArrayBuffer
					const file = new File([audioArrayBuffer], 'audio.ogg', { type: 'audio/ogg' });

					const [, texttranscriptPromise] = await Promise.allSettled([
						whatsapp.sendTextMessage('Transcribing audio...'),
						openai.audio.transcriptions.create({
							file: file,
							model: 'whisper-1',
						}),
					]);

					if (texttranscriptPromise.status === 'rejected') {
						await whatsapp.sendTextMessage('Failed to transcribe audio');
						return c.json('sucess', 200);
					}

					const texttranscript = texttranscriptPromise.value;
					console.log(`TTS : ${texttranscript.text}`);

					const [, completionPromise] = await Promise.allSettled([
						whatsapp.sendTextMessage('thinking...'),
						openai.chat.completions.create({
							messages: [
								{
									role: 'system',
									content: 'You are a happy helpful assistant. limit your response to 4000 characater, and respond like a human',
								},
								{ role: 'system', content: 'to get marks of student call the toll and to insert also call the tool' },
								{ role: 'user', content: texttranscript.text },
							],
							model: 'gpt-4o-mini-2024-07-18',
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
						}),
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
								const chat = await openai.chat.completions.create({
									messages: [
										{
											role: 'system',
											content: 'You are a happy helpful assistant. limit your response to 4000 characater, and respond like a human',
										},
										{ role: 'system', content: 'to get marks of student call the toll and to insert also call the tool' },
										{ role: 'user', content: texttranscript.text },
										{ role: "assistant", tool_calls: tools },
										{ role: 'tool', content: 'Added marks of student', tool_call_id: tool.id },
									],
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
								});
								const message = chat.choices[0].message.content;
								if (message) {
									await whatsapp.sendTextMessage(message);
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
								const chat = await openai.chat.completions.create({
									messages: [
										{
											role: 'system',
											content: 'You are a happy helpful assistant. limit your response to 4000 characater, and respond like a human',
										},
										{ role: 'system', content: 'to get marks of student call the toll and to insert also call the tool' },
										{ role: 'user', content: texttranscript.text },
										{ role: "assistant", tool_calls: tools },
										{ role: 'tool', content: JSON.stringify(marksPromise.value ? marksPromise.value : "Roll No not found" ), tool_call_id: tool.id },
									],
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
					console.log(completion.choices[0].message.tool_calls);
					if (message) {
						await whatsapp.sendTextMessage(message);
					} else {
						await whatsapp.sendTextMessage('No response from the model');
					}
				}
			} else {
				const text = messagearr[0].text?.body;
				if (text) {
					const whatsapp = new WhatsApp(payload.entry[0].changes[0].value.contacts[0].wa_id, c.env['wa-id'], c.env['wa-token']);
					await Promise.allSettled([whatsapp.markAsRead(messagearr[0].id), whatsapp.sendReaction(messagearr[0].id, '\uD83D\uDD04')]);

					const openai = new OpenAI({
						apiKey: c.env.openai,
					});

					const [, completionPromise] = await Promise.allSettled([
						whatsapp.sendTextMessage('thinking...'),
						openai.beta.chat.completions.parse({
							messages: [
								{
									role: 'system',
									content: 'You are a happy helpful assistant. limit your response to 4000 characater, and respond like a human',
								},
								{ role: 'user', content: text },
							],
							model: 'gpt-4o-mini-2024-07-18',
						}),
					]);
					if (completionPromise.status === 'rejected') {
						await whatsapp.sendTextMessage('Failed to get response from model');
						return c.json('sucess', 200);
					}
					const completion = completionPromise.value;
					const message = completion.choices[0].message.content;
					console.log(message);
					if (message) {
						await whatsapp.sendTextMessage(message);
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

const marks_obj = z.object({
	rollno: z.number().describe("Student's roll number"),
	marks: z.number().describe("Student's marks"),
});

type marksObj = z.infer<typeof marks_obj>;

const get_marks_schema = z.object({
	rollno: z.number().describe("Student's roll number"),
});

type getMarksSchema = z.infer<typeof get_marks_schema>;

async function add_marks(marksObj: marksObj, db: DrizzleD1Database) {
	await db.insert(marks).values({
		rollno: marksObj.rollno,
		marks: marksObj.marks,
	});
}

async function get_marks(robj: getMarksSchema, db: DrizzleD1Database) {
	const result = await db.select().from(marks).where(eq(robj.rollno, marks.rollno));
	return result[0];
}

export default app;
