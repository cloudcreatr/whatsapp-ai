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
		} catch (e) {
			console.log('Fetch Error: ', e);
		}
	}
}
