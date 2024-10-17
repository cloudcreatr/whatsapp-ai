import { Hono } from 'hono';
import { WhatsApp } from './messageClass';

import { drizzle } from 'drizzle-orm/d1';

import { isAudio, isDocument, isImage, isVideo } from './util/util';
import { webhookComponent } from './webhokkComponents';

import { HandleMessage } from './chat/handleMessage';
import { createGoogleGenerativeAI, google } from "@ai-sdk/google"
import { generateText } from 'ai';

const app = new Hono<{
	Bindings: Env;
}>();

interface payload {
	type: 'query' | 'upsert' | 'generate';
	id?: string;
	text: string;
}

app.get("/test", async (c) => {
	const google2 = createGoogleGenerativeAI({
		apiKey: c.env.GEMINI,
	})
	const { text } = await generateText({
		model: google2("gemini-1.5-flash-002"),
		prompt: "What is love",
	})
	return c.json({
		working: text
	})
})

app.get("/files/:id", async (c) => {
	const key = c.req.param("id")
	const orgin = new URL(c.req.url).origin
	const cache = caches.default
	const result = await cache.match(`${orgin}/files/${key}`, {
		ignoreMethod: true
	})
	if (result) {
		return result
	}


	const file = await c.env.WT.get(key)

	if (!file) {
		return c.text("File not found", 404)
	}
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
			const startHandleMessage = performance.now();
			const handleMessage = new HandleMessage({
				db,
				gemini,
				whatsapp,
				r2,
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
						await handleMessage.handleAudio(audioObj.id, messagearr[0].id, orgin);
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
			} else if (isImage(messagearr)) {
				const imageObj = messagearr[0].image;
				if (imageObj) {
					try {
						const startHanfleImage = performance.now();
						const text = imageObj.caption ? imageObj.caption : undefined;
						await handleMessage.handleImage(imageObj.id, messagearr[0].id, orgin, text);
						const endHanfleImage = performance.now();
						console.log(`Image: ${endHanfleImage - startHanfleImage}ms`);
						return c.json('sucess', 200);
					} catch (e) {
						console.log(`Image Error: ${e}`);
					}
				}
			} else if (isDocument(messagearr)) {
				const documentObj = messagearr[0].document;
				if (documentObj) {
					try {
						const startHanfleDocument = performance.now();
						const text = documentObj.caption ? documentObj.caption : undefined;
						await handleMessage.handleDocument(documentObj.id, messagearr[0].id, orgin, text);
						const endHanfleDocument = performance.now();
						console.log(`Document: ${endHanfleDocument - startHanfleDocument}ms`);
						return c.json('sucess', 200);
					} catch (e) {
						console.log(`Document Error: ${e}`);
					}
				}
			} else if (isVideo(messagearr)) {
				const videoObj = messagearr[0].video;
				if (videoObj) {
					try {
						const startHanfleVideo = performance.now();
						const text = videoObj.caption ? videoObj.caption : undefined;
						await handleMessage.handleVideo(videoObj.id, messagearr[0].id, orgin, text);
						const endHanfleVideo = performance.now();
						console.log(`Video: ${endHanfleVideo - startHanfleVideo}ms`);
						return c.json('sucess', 200);
					} catch (e) {
						console.log(`Video Error: ${e}`);
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
