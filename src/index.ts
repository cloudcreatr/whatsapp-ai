import { Hono } from 'hono';
import { WhatsApp } from './messageClass';
import OpenAI from 'openai/index.mjs';

const app = new Hono();

app.post('/', async (c) => {
	try {
		const payload: webhookComponent = await c.req.json();
		const messagearr = payload.entry[0].changes[0].value.messages;
		if (messagearr) {
			if (messagearr[0].type === 'audio') {
				const audioObj = messagearr[0].audio;
				if (audioObj) {
					const whatsapp = new WhatsApp(
						payload.entry[0].changes[0].value.contacts[0].wa_id,
						'410631452124211',
						'EAAGi4kGYHd0BO0dVBpXTeZAbfBrWlpn1ZCNz6rSPcxaApV1liZAp8glcJ4Cws27iLcGBTZBVZCQASZA8RaD5E7fpwlLBny5Fm8noA6iCv8cus52e0enA4RZB1UqjqfJspUkQP3ABKzJ6v9HKzDrvZALmX0XBaR6ljRcoJl60uFByVM1zUZB479GoViZC1P0uGtAqkAFPezMoPxz5YMFVnsi8wDMVKkVNEZD'
					);
					await whatsapp.markAsRead(messagearr[0].id);
					await whatsapp.sendReaction(messagearr[0].id, '\uD83D\uDD04');
					console.log(audioObj.id);
					const audioResponse = await whatsapp.getAudio(audioObj.id);
					if (!audioResponse) {
						throw new Error('Failed to retrieve audio');
					}
					console.log('Audio Content-Type:', audioResponse.headers.get('Content-Type'));

					// Get the audio data as an ArrayBuffer
					const audioArrayBuffer = await audioResponse.arrayBuffer();

					const openai = new OpenAI({
						apiKey:
							'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',
					});

					// Create a File object from the ArrayBuffer
					const file = new File([audioArrayBuffer], 'audio.ogg', { type: 'audio/ogg' });

					await whatsapp.sendTextMessage('Transcribing audio...');
					const texttranscript = await openai.audio.transcriptions.create({
						file: file,
						model: 'whisper-1',
					});
					await whatsapp.sendTextMessage('thinking...');
					const completion = await openai.chat.completions.create({
						messages: [
							{
								role: 'system',
								content: 'You are a happy helpful assistant. limit your response to 4000 characater, and respond like a human',
							},
							{ role: 'user', content: texttranscript.text },
						],
						model: 'gpt-4o-mini-2024-07-18',
					});
					const message = completion.choices[0].message.content;
					if (message) {
						try {
							await whatsapp.sendTextMessage('speaking...');
							const audio2 = await openai.audio.speech.create({
								model: 'tts-1-hd',
								input: message,
								response_format: 'mp3',
								voice: 'nova',
							});
							//const audio2 = await generateAudio(message);

							console.log(audio2.headers.get('Content-Type'));

							const audioBlob = await audio2.blob();
							const uploadAudio = await whatsapp.uploadAudio(audioBlob, 'audio/mpeg');
							await whatsapp.sendAudioMessage({
								id: uploadAudio,
							});
						} catch (error) {
							console.error('Error in audio processing or sending:', error);
						}
					} else {
						await whatsapp.sendTextMessage('No response from the model');
					}
				}
			} else {
				const text = messagearr[0].text?.body;
				if (text) {
					const whatsapp = new WhatsApp(
						payload.entry[0].changes[0].value.contacts[0].wa_id,
						'410631452124211',
						'EAAGi4kGYHd0BO0dVBpXTeZAbfBrWlpn1ZCNz6rSPcxaApV1liZAp8glcJ4Cws27iLcGBTZBVZCQASZA8RaD5E7fpwlLBny5Fm8noA6iCv8cus52e0enA4RZB1UqjqfJspUkQP3ABKzJ6v9HKzDrvZALmX0XBaR6ljRcoJl60uFByVM1zUZB479GoViZC1P0uGtAqkAFPezMoPxz5YMFVnsi8wDMVKkVNEZD'
					);
					await whatsapp.markAsRead(messagearr[0].id);
					await whatsapp.sendReaction(messagearr[0].id, '\uD83D\uDD04');

					const openai = new OpenAI({
						apiKey:
							'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',
					});
					await whatsapp.sendTextMessage('thinking...');
					const completion = await openai.chat.completions.create({
						messages: [
							{
								role: 'system',
								content: 'You are a happy helpful assistant. limit your response to 4000 characater, and respond like a human',
							},
							{ role: 'user', content: text },
						],
						model: 'gpt-4o-mini-2024-07-18',
					});
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
