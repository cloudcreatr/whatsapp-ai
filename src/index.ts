import { Hono } from 'hono';
import { WhatsApp } from './messageClass';
import OpenAI from 'openai/index.mjs';

const app = new Hono<{
	Bindings: Env;
}>();

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
								{ role: 'user', content: texttranscript.text },
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
						openai.chat.completions.create({
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

function generateAudio(text: string) {
	return fetch(`https://api.elevenlabs.io/v1/text-to-speech/kPzsL2i3teMYv0FxEYQ6`, {
		method: 'POST',
		headers: {
			'xi-api-key': 'sk_c6f26d8a9ad5d39e37bb05b33f1b73a9e73f82c17354e8b4',
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			text: text,
			model_id: 'eleven_turbo_v2_5',
			voice_settings: {
				stability: 0.5,
				similarity_boost: 0.7,
				use_speaker_boost: true,
			},
		}),
	});
}

export default app;
