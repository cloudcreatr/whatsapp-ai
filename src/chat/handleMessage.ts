
import { storeMessageDB } from './history';
import { DrizzleD1Database } from 'drizzle-orm/d1';
import { Message, MesaagesArrayType } from './completion';

import { WhatsApp } from '../messageClass';


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



		const [, completionPromise] = await Promise.allSettled([
			this.whatsapp.sendTextMessage('_thinking..._'),
			generateText({
				model: this.model,
				messages: this.Message,
			}),
			this.storeMessage.saveMessage([{ role: 'user', content: text }]),
		]);


		if (completionPromise.status === 'rejected') {
			console.log(completionPromise.reason);
			await Promise.allSettled([
				this.whatsapp.sendTextMessage(JSON.stringify(completionPromise.reason)),
				this.whatsapp.sendTextMessage(' failed to get response from outer test'),

			]);

			return;
		}
		const { text: completionText } = completionPromise.value;


		if (completionText) {

			await Promise.allSettled([
				this.whatsapp.sendTextMessage(completionText),
				this.storeMessage.saveMessage([{ role: 'assistant', content: completionText }]),
			]);
			this.Message.push({
				role: 'assistant',
				content: completionText,
			});

		} else {
			await this.whatsapp.sendTextMessage('No response from the model');
		}
	};

	handleText = async (text: string, messageID: string) => {

		await Promise.allSettled([
			this.whatsapp.markAsRead(messageID),
			this.whatsapp.sendReaction(messageID, '\uD83D\uDD04'),
			this.storeMessage.loadMessage(this.Message),
		]);


		await this.handleCompletion(text);
	};
	handleAudio = async (audioID: string, messageID: string, host: string) => {

		const [, , audioPromise] = await Promise.allSettled([
			this.whatsapp.markAsRead(messageID),
			this.whatsapp.sendReaction(messageID, '\uD83D\uDD04'),
			this.whatsapp.getAudio(audioID),
			this.storeMessage.loadMessage(this.Message),
		]);

		if (audioPromise.status === 'rejected') {
			await this.whatsapp.sendTextMessage('Failed to get audio');
			return;
		}

		const file = audioPromise.value.body as ReadableStream;

		console.log("AUDIO REQUEST", audioPromise.value.status)
		if (audioPromise.value.status !== 200) {
			console.log("AUDIO REQUEST", await audioPromise.value.json())
			await this.whatsapp.sendTextMessage('Failed to get audio');
			return;
		}



		await this.handleFIleCompletion(file, host, 'audio/ogg', "anaylse this");
	};
	handleImage = async (imageID: string, messageID: string, host: string, text: string) => {

		const [, , imagePromise] = await Promise.allSettled([
			this.whatsapp.markAsRead(messageID),
			this.whatsapp.sendReaction(messageID, '\uD83D\uDD04'),
			this.whatsapp.downLoadFile(imageID),
			this.storeMessage.loadMessage(this.Message),
		]);

		if (imagePromise.status === 'rejected') {
			await this.whatsapp.sendTextMessage('Failed to get image');
			return;
		}

		const file = imagePromise.value.stream as ReadableStream;




		await this.handleFIleCompletion(file, host, imagePromise.value.mime, text);
	}
	handleDocument = async (documentID: string, messageID: string, host: string, text: string) => {

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
	handleVideo = async (videoID: string, messageID: string, host: string, text: string) => {
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
	handleFIleCompletion = async (File: ReadableStream, host: string, mimeType: string, text: string) => {
		const path = crypto.randomUUID()
		await Promise.allSettled([
			this.whatsapp.sendTextMessage('_thinking..._'),

			this.R2.put(path, File, {
				httpMetadata: {
					contentType: mimeType,
				}
			})
		])
		const fileURL = `https://pub-86c0544a7c2840658cd58dbc029e9633.r2.dev/${path}`


		const content: UserContent = [{
			type: "file",
			data: `${fileURL}`,
			mimeType: mimeType,
		}]

		content.push({
			type: "text",
			text: "here some file, just go through it",
		})


		this.Message.push({
			role: 'user',
			content: content,
		});






		const [response] = await Promise.allSettled([
			generateText({
				model: this.model,
				messages: this.Message,
			}),

		]);
		if (response.status === 'rejected') {
			await this.whatsapp.sendTextMessage('Failed to get response from model');
			await this.whatsapp.sendTextMessage(JSON.stringify(response.reason));
			return;
		}

		const { text: completionText } = response.value;

		await Promise.allSettled([this.whatsapp.sendTextMessage(completionText),
		this.storeMessage.saveMessage([{
			role: "user", content: [{
				type: "file",
				data: `${fileURL}`,
				mimeType: mimeType,
			}, {
				type: "text",
				text: "here some file, just go through it",
			}]
		}, { role: 'assistant', content: completionText }])



		]);
		return










	}
}
