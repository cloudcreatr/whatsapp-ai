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

export interface sendListOption {
	type: 'list';
	header: {
		type: 'text';
		text: string;
	};
	body: {
		text: string;
	};
	footer: {
		text: string;
	};
	action: {
		sections: {
			title: string;
			rows: {
				id: string;
				title: string;
				description?: string;
			}[];
		}[];
		button: string;
	};
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
	footer: z.string().optional().describe('A short and simple text for footer, Maximum 60 characters.'),
	body: z.string().describe('Inlcude All your response here upto Maximum 1024 characters.'),
});

export class WhatsApp {
	private to: string;
	private WHATSAPP_BUSINESS_PHONE_NUMBER_ID: string;
	private token: string;

	constructor(to: string, WHATSAPP_BUSINESS_PHONE_NUMBER_ID: string, token: string) {
		this.to = to;
		this.WHATSAPP_BUSINESS_PHONE_NUMBER_ID = WHATSAPP_BUSINESS_PHONE_NUMBER_ID;
		this.token = token;
	}
	async sendRequest(type: string, payload: any) {
		try {
			const start = performance.now();
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
			if (!response.ok) {
				console.log('Error:', await response.json());
			}
			const end = performance.now();
			console.log(`Whatsapp (${type}): ${end - start}ms`);
			return response;
		} catch (e) {
			console.log('Fetch Error: ', e);
		}
	}

	async downLoadFile(id: string) {
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
			if (!response.ok) {
				console.log('Error:', await response.json());
			}
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
}
