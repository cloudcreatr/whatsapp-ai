import { stream } from 'elevenlabs';
import { z } from 'zod';

export interface uploadResponse {
	id: string;
}

export interface reterivemedia {
	messaging_product: 'whatsapp';
	url: string;
	mime_type: string;
	sha256: string;
	file_size: string;
	id: string;
}

interface confirmMessage {
	type: 'button';
	body: {
		text: string;
	};
	footer?: {
		text: string;
	};
	action: {
		buttons: Array<{
			type: 'reply';
			reply: {
				id: string;
				title: string;
			};
		}>;
	};
}

export const confirmMessageSchema = z.object({
	option1: z.string().describe('A text for button 1, MAX 20 characters'),
	option2: z.string().describe('A text for button 2, MAX 20 characters'),
	footer: z.string().optional().describe('A text for footer'),
	body: z.string().describe('A text for body'),
});

export class WhatsApp {
	to: string;
	WHATSAPP_BUSINESS_PHONE_NUMBER_ID: string;
	token: string;

	constructor(to: string, WHATSAPP_BUSINESS_PHONE_NUMBER_ID: string, token: string) {
		this.to = to;
		this.WHATSAPP_BUSINESS_PHONE_NUMBER_ID = WHATSAPP_BUSINESS_PHONE_NUMBER_ID;
		this.token = token;
	}

	// async uploadAudio(file: File | Blob, type: string) {
	// 	try {
	// 		const formdata = new FormData();
	// 		formdata.append('messaging_product', 'whatsapp');
	// 		formdata.append('file', file);
	// 		formdata.append('type', type);

	// 		const response = await fetch(`https://graph.facebook.com/v20.0/${this.WHATSAPP_BUSINESS_PHONE_NUMBER_ID}/media`, {
	// 			method: 'POST',
	// 			headers: {
	// 				Authorization: `Bearer ${this.token}`,
	// 				// Remove the Content-Type header
	// 			},
	// 			body: formdata,
	// 		});

	// 		if (!response.ok) {
	// 			const errorData = await response.json();
	// 			console.error('API Error:', errorData);
	// 			throw new Error(`HTTP error! status: ${response.status}`);
	// 		}

	// 		const data: uploadResponse = await response.json();
	// 		console.log(data);
	// 		return data.id;
	// 	} catch (e) {
	// 		console.error('Fetch Error: ', e);
	// 		throw e; // Re-throw the error so it can be handled by the caller
	// 	}
	// }

	async downLoadImage(id: string) {
		const response = await fetch(`https://graph.facebook.com/v20.0/${id}?phone_number_id=${this.WHATSAPP_BUSINESS_PHONE_NUMBER_ID}`, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',

				Authorization: `Bearer ${this.token}`,
			},
		});
		const data = (await response.json()) as reterivemedia;
		const url = data.url;
		const response2 = await fetch(url, {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${this.token}`,
				'User-Agent': 'cloudcreatr',
			},
		});
		return { stream: response2.body, mime: data.mime_type };
	}

	async getAudio(id: string) {
		const response = await fetch(`https://graph.facebook.com/v20.0/${id}?phone_number_id=${this.WHATSAPP_BUSINESS_PHONE_NUMBER_ID}`, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',

				Authorization: `Bearer ${this.token}`,
			},
		});

		const data = (await response.json()) as reterivemedia;

		const url = data.url;

		const audioRes = await fetch(url, {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${this.token}`,
				'User-Agent': 'cloudcreatr',
			},
		});

		return audioRes;
	}

	async sendReaction(messageId: string, emoji: string) {
		await this.sendRequest('reaction', { message_id: messageId, emoji });
	}

	async markAsRead(messageId: string) {
		try {
			const response = await fetch(`https://graph.facebook.com/v20.0/${this.WHATSAPP_BUSINESS_PHONE_NUMBER_ID}/messages`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${this.token}`,
				},
				body: JSON.stringify({
					messaging_product: 'whatsapp',
					status: 'read',
					message_id: messageId,
				}),
			});
		} catch (e) {
			console.log('Fetch Error: ', e);
		}
	}

	comfirmMessage = async ({ option1, option2, footer, body }: z.infer<typeof confirmMessageSchema>) => {
		console.log('comfirmMessage', option1, option2, footer, body);
		const obj: confirmMessage = {
			type: 'button',
			body: {
				text: body,
			},
			action: {
				buttons: [
					{
						type: 'reply',
						reply: {
							id: '1',
							title: option1,
						},
					},
					{
						type: 'reply',
						reply: {
							id: '2',
							title: option2,
						},
					},
				],
			},
		};
		if (footer) {
			obj.footer = {
				text: footer,
			};
		}

		const response = await this.sendRequest('interactive', obj);
		console.log('response', await response?.json());
		return 'Message sent';
	};

	async sendTextMessage(text: string) {
		await this.sendRequest('text', { body: text });
	}

	async sendAudioMessage(audio: { id?: string; url?: string }) {
		if (audio.id) {
			await this.sendRequest('audio', { id: audio.id });
		} else {
			await this.sendRequest('audio', { url: audio.url });
		}
	}
	private async sendRequest(type: string, payload: any) {
		try {
			const response = await fetch(`https://graph.facebook.com/v20.0/${this.WHATSAPP_BUSINESS_PHONE_NUMBER_ID}/messages`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${this.token}`,
				},
				body: JSON.stringify({
					messaging_product: 'whatsapp',
					recipient_type: 'individual',
					to: this.to,
					type: type,
					[type]: payload,
				}),
			});
			return response;
		} catch (e) {
			console.log('Fetch Error: ', e);
		}
	}
}
