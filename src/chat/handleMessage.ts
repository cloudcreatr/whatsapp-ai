import OpenAI from 'openai';
import { Tools, ToolsArray } from '../chat/tools';
import { storeMessageDB } from './history';
import { DrizzleD1Database } from 'drizzle-orm/d1';
import { Message } from './completion';
import { Mark, get_marks_schema, marks_obj } from '../tools/marks';
import { z } from 'zod';
import { confirmMessageSchema, WhatsApp } from '../messageClass';
import { returnAudioFile } from '../util/audioProcess';
import { Email, sendEmailSchema } from '../tools/email';
import { searchSchema, Vector } from '../vector/vector';
import {
	currentUTCEpochInSeconds,
	currentUTCEpochInSecondsSchema,
	DateToUTCEpochInSeconds,
	DateToUTCEpochInSecondsSchema,
	UTCEpochInSecondsToDate,
	UTCEpochInSecondsToDateSchema,
} from '../tools/currentUTCEpochInSeconds';

export class HandleMessage {
	private executeTools: InstanceType<typeof Tools>;
	private openai: InstanceType<typeof OpenAI>;
	private db: DrizzleD1Database;
	private storeMessage: InstanceType<typeof storeMessageDB>;
	private toolsArray: ToolsArray;
	private mark: InstanceType<typeof Mark>;
	private whatsapp: InstanceType<typeof WhatsApp>;
	private email: InstanceType<typeof Email>;
	private Message: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
	private vector: InstanceType<typeof Vector>;

	constructor({
		db,
		openaikey,
		emailToken,
		FromEmail,
		whatsapp,
	}: {
		db: DrizzleD1Database;
		openaikey: string;
		emailToken: string;
		FromEmail: string;
		whatsapp: InstanceType<typeof WhatsApp>;
	}) {
		this.db = db;
		this.openai = new OpenAI({
			apiKey: openaikey,
		});
		this.storeMessage = new storeMessageDB(db);
		this.mark = new Mark(db);
		this.email = new Email(emailToken, FromEmail);
		this.whatsapp = whatsapp;
		this.Message = Message;
		this.vector = new Vector({ openai: openaikey });
		this.toolsArray = [
			{
				name: 'add_marks',
				parameters: marks_obj,
				description: 'Add marks to the database',
				beforeMessage: '_adding marks to database_',
				function: this.mark.add_marks,
			},
			{
				name: 'get_marks',
				parameters: get_marks_schema,
				description: 'Get marks from the database',
				beforeMessage: '_getting marks from database_',
				function: this.mark.get_marks,
			},
			{
				name: 'deleteHistory',
				description: 'call this tool to Delete the history of the chat, this will make you forget evrything',
				parameters: z.object({}),
				beforeMessage: '_deleting history_',
				function: this.storeMessage.deleteHistory,
			},
			{
				name: 'comfirmMessage',
				parameters: confirmMessageSchema,
				beforeMessage: '_sending comfirmation message_',
				description:
					'Send a message with two buttons, option1 has string(MAX 20 character), that user will click and option2 has string (MAX 20 Character), that user will click. CONSIDER THIS AS IF A CONFIRMATION YOU SEND TO USER',
				function: whatsapp.comfirmMessage,
			},
			{
				name: 'sendEmail',
				parameters: sendEmailSchema,
				beforeMessage: '_sending email_',
				description:
					'Sends an email to the provided email address, only call this tool if you have confirmed to send this email and its content through comfirmMessage',
				function: this.email.sendEmail,
			},
			{
				name: 'searchSubject',
				parameters: searchSchema,
				beforeMessage: '_searching subject_',
				description: 'Search the subject in the vector database',
				function: this.vector.searchSubject,
			},
			{
				name: 'DateToUTCEpochInSeconds',
				parameters: DateToUTCEpochInSecondsSchema,
				beforeMessage: '_converting date to UTC epoch in seconds_',
				description: 'Convert the date to UTC epoch in seconds',
				function: DateToUTCEpochInSeconds,
			},
			{
				name: 'currentUTCEpochInSeconds',
				parameters: currentUTCEpochInSecondsSchema,
				beforeMessage: '_getting current UTC epoch in seconds_',
				description: 'Get the current UTC epoch in seconds',
				function: currentUTCEpochInSeconds,
			},
			{
				name: 'UTCEpochInSecondsToDate',
				parameters: UTCEpochInSecondsToDateSchema,
				beforeMessage: '_converting UTC epoch in seconds to ISO date string_',
				description: 'Convert the UTC epoch in seconds to ISO date string adjusted to IST',
				function: UTCEpochInSecondsToDate,
			},
		];
		this.executeTools = new Tools(this.toolsArray, this.db, this.Message, openaikey, this.whatsapp);
	}

	handleCompletion = async (text: string) => {
		this.Message.push({
			role: 'user',
			content: text,
		});
		const startCompletion = performance.now();
		const [, completionPromise] = await Promise.allSettled([
			this.whatsapp.sendTextMessage('_thinking..._'),
			this.openai.beta.chat.completions.parse({
				messages: this.Message,
				tools: this.executeTools.genrateTools(),
				model: 'gpt-4o-mini-2024-07-18',
				parallel_tool_calls: false,
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
		const completion = completionPromise.value;
		const tools = completion.choices[0].message.tool_calls;

		if (tools.length > 0) {
			await this.executeTools.executeTools(tools);
			// console.log('Message (tool)', JSON.stringify(Message, null, 2));
			return;
		}
		const message = completion.choices[0].message.content;
		// console.log('message ai', message);
		if (message) {
			const LastMessage = performance.now();
			await Promise.allSettled([
				this.whatsapp.sendTextMessage(message),
				this.storeMessage.saveMessage([{ role: 'assistant', content: message }]),
			]);
			this.Message.push({
				role: 'assistant',
				content: message,
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
	handleAudio = async (audioID: string, messageID: string) => {
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

		const file = await returnAudioFile(audioPromise.value.arrayBuffer());
        const startTranscription = performance.now();
		const [, texttranscriptPromise] = await Promise.allSettled([
			this.whatsapp.sendTextMessage('_Transcribing audio..._'),
			this.openai.audio.transcriptions.create({
				file,
				model: 'whisper-1',
			}),
		]);
		console.log(`Transcription: ${performance.now() - startTranscription}ms`);
		

		if (texttranscriptPromise.status === 'rejected') {
			await this.whatsapp.sendTextMessage('_Failed to transcribe audio_');
			return;
		}

		const text = texttranscriptPromise.value.text;
		await this.handleCompletion(text);
	};
}