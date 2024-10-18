import { Hono } from 'hono';
import { WhatsApp } from './messageClass';

import { drizzle } from 'drizzle-orm/d1';

import { isAudio, isDocument, isImage, isVideo } from './util/util';
import { webhookComponent } from './webhokkComponents';

import { HandleMessage } from './chat/handleMessage';
import { createGoogleGenerativeAI, google } from "@ai-sdk/google"
import { generateText } from 'ai';
import { history } from './schema/ai';

const app = new Hono<{
	Bindings: Env;
}>();



//rucha bro
interface payload {
	type: 'query' | 'upsert' | 'generate';
	id?: string;
	text: string;
}

app.get("/his", async (c) => {
	const db = drizzle(c.env.DB);
	await db.delete(history)
	return c.json("done")

})

app.get("/files/:id", async (c) => {
	const key = c.req.param("id")
	const orgin = new URL(c.req.url).origin
	const cache = caches.default
	const result = await cache.match(`${orgin}/files/${key}`, {
		ignoreMethod: true
	})
	if (result) {
		console.log("cache hit")
		return result
	}


	const file = await c.env.WT.get(key)

	if (!file) {

		return c.text("File not found", 404)
	}
	console.log("cache miss")
	console.log({
		"Content-Type": file.httpMetadata?.contentType || "application/octet-stream",
		"key": key
	})
	const resopnse = new Response(file.body, {
		status: 200,
		headers: {
			"Content-Type": file.httpMetadata?.contentType || "application/octet-stream",
		}
	})
	c.executionCtx.waitUntil(cache.put(`${orgin}/files/${key}`, resopnse.clone()))
	return resopnse



})


app.get('/', async (c) => {
	const hub_challenge = c.req.query('hub.challenge');
	const hub_verify_token = c.req.query('hub.verify_token');
	if (!hub_challenge || !hub_verify_token) {
		return c.text('Invalid request', 400);
	}
	if (hub_verify_token === c.env.hub.verify_token) {
		return c.text(hub_challenge, 200);
	}
	c.env.WT
});

app.post('/', async (c) => {
	try {
		const payload: webhookComponent = await c.req.json();

		const messagearr = payload.entry[0].changes[0].value.messages;
		const db = drizzle(c.env.DB);
		const r2 = c.env.WT
		const gemini = c.env.GEMINI;
		const orgin = new URL(c.req.url).origin
		if (messagearr && messagearr.length > 0) {
			console.log(payload.entry[0].changes[0].value.contacts[0].wa_id);

			const whatsapp = new WhatsApp(payload.entry[0].changes[0].value.contacts[0].wa_id, c.env['wa-id'], c.env['wa-token']);

			const handleMessage = new HandleMessage({
				db,
				gemini,
				whatsapp,
				r2,
			});

			const text = messagearr[0].text?.body;
			const interactive = messagearr[0].interactive;

			if (isAudio(messagearr)) {
				const audioObj = messagearr[0].audio;
				if (audioObj) {
					try {

						await handleMessage.handleAudio(audioObj.id, messagearr[0].id, orgin);

						return c.json('sucess', 200);
					} catch (e) {
						console.log(`Audio Error: ${e}`);
					}
				}
			} else if (text) {
				try {

					await handleMessage.handleText(text, messagearr[0].id);

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
			} else if (isImage(messagearr)) {
				const imageObj = messagearr[0].image;
				if (imageObj) {
					try {

						const text = imageObj.caption ? imageObj.caption : "here is the file"
						await handleMessage.handleImage(imageObj.id, messagearr[0].id, orgin, text);

						return c.json('sucess', 200);
					} catch (e) {
						console.log(`Image Error: ${e}`);
					}
				}
			} else if (isDocument(messagearr)) {
				const documentObj = messagearr[0].document;
				if (documentObj) {
					try {

						const text = documentObj.caption ? documentObj.caption : "here is the file"
						await handleMessage.handleDocument(documentObj.id, messagearr[0].id, orgin, text);

						return c.json('sucess', 200);
					} catch (e) {
						console.log(`Document Error: ${e}`);
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
