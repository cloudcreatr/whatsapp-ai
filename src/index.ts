import { Hono } from 'hono';
import { WhatsApp } from './messageClass';

import { drizzle } from 'drizzle-orm/d1';

import { isAudio } from './util/util';
import { webhookComponent } from './webhokkComponents';

import { HandleMessage } from './chat/handleMessage';
import OpenAI from 'openai';
import { Vector } from './vector/vector';

const app = new Hono<{
	Bindings: Env;
}>();

interface payload {
	type: 'query' | 'upsert' | 'generate';
	id?: string;
	text: string;
}

// app.post('/emd', async (c) => {
// 	const text = await c.req.json<payload>();
// 	console.log(text);
// 	if (!text.text) {
// 		return c.text('Invalid request', 400);
// 	}
// 	if (!text.type || (text.type !== 'query' && text.type !== 'upsert' && text.type !== 'generate')) {
// 		return c.text('Invalid type', 400);
// 	}
// 	if (text.type === 'upsert' && !text.id) {
// 		return c.text('Invalid ID', 400);
// 	}
// 	const vector = new Vector({ openai: c.env.openai });
// 	if (text.type === 'query') {
// 		const response = await vector.searchSubject(text.text);
// 		return c.json(response, 200);
// 	}
// 	if (text.type === 'upsert') {
// 		const response = await vector.generateEmbedding({ text: text.text, id: text.id!, metadata: { name: text.text } });
// 		return c.json(response, 200);
// 	}
// 	if (text.type === 'generate') {
// 		const openai = new OpenAI({
// 			apiKey: c.env.openai,
// 		});
// 		const response = await openai.embeddings.create({
// 			model: 'text-embedding-3-small',
// 			input: text.text,
// 		});
// 		const emd = response.data[0].embedding;
// 		return c.json(emd, 200);
// 	}
// });

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
		const db = drizzle(c.env.DB);

		if (messagearr && messagearr.length > 0) {
			console.log(payload.entry[0].changes[0].value.contacts[0].wa_id);
			const whatsapp = new WhatsApp(payload.entry[0].changes[0].value.contacts[0].wa_id, c.env['wa-id'], c.env['wa-token']);
			const startHandleMessage = performance.now();
			const handleMessage = new HandleMessage({
				db,
				openaikey: c.env.openai,
				whatsapp,
				emailToken: c.env.resend,
				FromEmail: 'ai@cloudcreatr.com',
			});
			const endHandleMessage = performance.now();
			console.log(`HandleMessage: ${endHandleMessage - startHandleMessage}ms`);

			const text = messagearr[0].text?.body;
			const interactive = messagearr[0].interactive;

			if (isAudio(messagearr)) {
				const audioObj = messagearr[0].audio;
				if (audioObj) {
					try {
						const startHanfleAudio = performance.now();
						await handleMessage.handleAudio(audioObj.id, messagearr[0].id);
						const endHanfleAudio = performance.now();
						console.log(`Audio: ${endHanfleAudio - startHanfleAudio}ms`);
						return c.json('sucess', 200);
					} catch (e) {
						console.log(`Audio Error: ${e}`);
					}
				}
			} else if (text) {
				try {
					const startHandleText = performance.now();
					await handleMessage.handleText(text, messagearr[0].id);
					const endHandleText = performance.now();
					console.log(`Text: ${endHandleText - startHandleText}ms`);
					return c.json('sucess', 200);
				} catch (e) {
					console.log(` TEXT Error: ${e}`);
				}
			} else if (interactive && interactive.type === 'button_reply') {
				const buttonObject = interactive.button_reply;
				console.log('buttonObject', buttonObject);
				if (buttonObject) {
					const text = buttonObject.title;
					try {
						await handleMessage.handleText(text, messagearr[0].id);
						return c.json('sucess', 200);
					} catch (e) {
						console.log(`Button reply: ${e}`);
					}
				}
			} 
		}
	} catch (e) {
		console.log(`Critical Error: ${e}`);
	}
	return c.json('sucess', 200);
});

export default app;
