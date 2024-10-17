
import { storeMessageDB } from './history';
import { DrizzleD1Database } from 'drizzle-orm/d1';
import { Message, MesaagesArrayType } from './completion';

import { WhatsApp } from '../messageClass';
import { returnAudioFile } from '../util/audioProcess';

import { generateText, LanguageModel, UserContent } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

export class HandleMessage {


	private storeMessage: InstanceType<typeof storeMessageDB>;
	private model: LanguageModel;

	private whatsapp: InstanceType<typeof WhatsApp>;

	private Message: MesaagesArrayType;
	private R2: R2Bucket;

	constructor({
		db,
		gemini,
		r2,
		whatsapp,
	}: {
		db: DrizzleD1Database;
		gemini: string;

		whatsapp: InstanceType<typeof WhatsApp>;
		r2: R2Bucket;
	}) {
		const google = createGoogleGenerativeAI({
			apiKey: gemini,
		})
		this.R2 = r2;

		this.storeMessage = new storeMessageDB(db);

		this.model = google("gemini-1.5-flash-002")
		this.whatsapp = whatsapp;
		this.Message = Message;


	}

	handleCompletion = async (text: string) => {
		this.Message.push({
			role: 'user',
			content: text,
		});
		const startCompletion = performance.now();



		const [, completionPromise] = await Promise.allSettled([
			this.whatsapp.sendTextMessage('_thinking..._'),
			generateText({
				model: this.model,
				messages: this.Message,
			}),
			this.storeMessage.saveMessage([{ role: 'user', content: text }]),
		]);
		const endCompletion = performance.now();
		console.log(`Completion: ${endCompletion - startCompletion}ms`);


		if (completionPromise.status === 'rejected') {
			console.log(completionPromise.reason);
			await Promise.allSettled([
				this.whatsapp.sendTextMessage(' failed to get response from outer'),
				this.whatsapp.sendTextMessage(completionPromise.reason),
			]);

			return;
		}
		const { text: completionText } = completionPromise.value;


		if (completionText) {
			const LastMessage = performance.now();
			await Promise.allSettled([
				this.whatsapp.sendTextMessage(completionText),
				this.storeMessage.saveMessage([{ role: 'assistant', content: completionText }]),
			]);
			this.Message.push({
				role: 'assistant',
				content: completionText,
			});
			console.log(`LastMessage: ${performance.now() - LastMessage}ms`);
			// console.log('Message (text)', JSON.stringify(Message, null, 2));
		} else {
			await this.whatsapp.sendTextMessage('No response from the model');
		}
	};

	handleText = async (text: string, messageID: string) => {
		const start = performance.now();
		await Promise.allSettled([
			this.whatsapp.markAsRead(messageID),
			this.whatsapp.sendReaction(messageID, '\uD83D\uDD04'),
			this.storeMessage.loadMessage(this.Message),
		]);
		console.log(`HandleText: ${performance.now() - start}ms`);
		// console.log('text', text);

		await this.handleCompletion(text);
	};
	handleAudio = async (audioID: string, messageID: string, host: string) => {
		const start = performance.now();
		const [, , audioPromise] = await Promise.allSettled([
			this.whatsapp.markAsRead(messageID),
			this.whatsapp.sendReaction(messageID, '\uD83D\uDD04'),
			this.whatsapp.getAudio(audioID),
			this.storeMessage.loadMessage(this.Message),
		]);
		console.log(`HandleAudio: ${performance.now() - start}ms`);
		if (audioPromise.status === 'rejected') {
			await this.whatsapp.sendTextMessage('Failed to get audio');
			return;
		}

		const file = audioPromise.value.body as ReadableStream;



		await this.handleFIleCompletion(file, host, 'audio/ogg');
	};
	handleImage = async (imageID: string, messageID: string, host: string, text?: string) => {
		const start = performance.now();
		const [, , imagePromise] = await Promise.allSettled([
			this.whatsapp.markAsRead(messageID),
			this.whatsapp.sendReaction(messageID, '\uD83D\uDD04'),
			this.whatsapp.downLoadFile(imageID),
			this.storeMessage.loadMessage(this.Message),
		]);
		console.log(`HandleImage: ${performance.now() - start}ms`);
		if (imagePromise.status === 'rejected') {
			await this.whatsapp.sendTextMessage('Failed to get image');
			return;
		}

		const file = imagePromise.value.stream as ReadableStream;

		await this.handleFIleCompletion(file, host, imagePromise.value.mime, text);
	}
	handleDocument = async (documentID: string, messageID: string, host: string, text?: string) => { 

		const start = performance.now();
		const [, , documentPromise] = await Promise.allSettled([
			this.whatsapp.markAsRead(messageID),
			this.whatsapp.sendReaction(messageID, '\uD83D\uDD04'),
			this.whatsapp.downLoadFile(documentID),
			this.storeMessage.loadMessage(this.Message),
		]);
		console.log(`HandleDocument: ${performance.now() - start}ms`);
		if (documentPromise.status === 'rejected') {
			await this.whatsapp.sendTextMessage('Failed to get document');
			return;
		}

		const file = documentPromise.value.stream as ReadableStream;

		await this.handleFIleCompletion(file, host, documentPromise.value.mime, text);
	}
	handleVideo = async (videoID: string, messageID: string, host: string, text?: string) => {
		const start = performance.now();
		const [, , videoPromise] = await Promise.allSettled([
			this.whatsapp.markAsRead(messageID),
			this.whatsapp.sendReaction(messageID, '\uD83D\uDD04'),
			this.whatsapp.downLoadFile(videoID),
			this.storeMessage.loadMessage(this.Message),
		]);
		console.log(`HandleVideo: ${performance.now() - start}ms`);
		if (videoPromise.status === 'rejected') {
			await this.whatsapp.sendTextMessage('Failed to get video');
			return;
		}

		const file = videoPromise.value.stream as ReadableStream;

		await this.handleFIleCompletion(file, host, videoPromise.value.mime, text);
	}
	handleFIleCompletion = async (File: ReadableStream, host: string, mimeType: string, text?: string) => {
		const path = crypto.randomUUID()
		await this.R2.put(path, File);
		const fileURL = `${host}/files/${path}`;

		const content: UserContent = [{
			type: "file",
			data: `${fileURL}`,
			mimeType: mimeType,
		}]
		if (text) {
			content.push({
				type: "text",
				text: text,
			})
		}

		this.Message.push({
			role: 'user',
			content: content,
		});
		const startCompletion = performance.now();



		const [, completionPromise] = await Promise.allSettled([
			this.whatsapp.sendTextMessage('_thinking..._'),
			generateText({
				model: this.model,
				messages: this.Message,
			}),
			this.storeMessage.saveMessage([{
				role: 'user',
				content: content,
			}])

		]);

		const endCompletion = performance.now();
		console.log(`Completion: ${endCompletion - startCompletion}ms`);


		if (completionPromise.status === 'rejected') {
			console.log(completionPromise.reason);
			await Promise.allSettled([
				this.whatsapp.sendTextMessage(' failed to get response from outer'),
				this.whatsapp.sendTextMessage(completionPromise.reason),
			]);

			return;
		}
		const { text: completionText } = completionPromise.value;


		if (completionText) {
			const LastMessage = performance.now();
			await Promise.allSettled([
				this.whatsapp.sendTextMessage(completionText),
				this.storeMessage.saveMessage([{ role: 'assistant', content: completionText }]),
			]);
			this.Message.push({
				role: 'assistant',
				content: completionText,
			});
			console.log(`LastMessage: ${performance.now() - LastMessage}ms`);

		} else {
			await this.whatsapp.sendTextMessage('No response from the model');
		}
	}
}
