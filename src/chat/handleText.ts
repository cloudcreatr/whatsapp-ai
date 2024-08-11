import { Tools } from './tools';
import { marks_obj, get_marks_schema } from '../tools/marks';
import { drizzle, DrizzleD1Database } from 'drizzle-orm/d1';
import { storeMessageDB } from './history';
import { OpenAI } from 'openai';
import { Mark } from '../tools/marks';
import { confirmMessageSchema, WhatsApp } from '../messageClass';
import { z } from 'zod';
import { Message } from './completion';
export async function HandleText({
	text,
	openaiKey,
	whatsapp,
	db,
}: {
	text: string;
	openaiKey: string;
	whatsapp: InstanceType<typeof WhatsApp>;
	db: DrizzleD1Database;
}) {
	const messageDB = new storeMessageDB(db);
	const openai = new OpenAI({
		apiKey: openaiKey,
	});
	const mark = new Mark(db);

	const executeTools = new Tools(
		[
			{
				name: 'add_marks',
				parameters: marks_obj,
				description: 'Add marks to the database',
				beforeMessage: '_adding marks to database_',
				function: mark.add_marks,
			},
			{
				name: 'get_marks',
				parameters: get_marks_schema,
				description: 'Get marks from the database',
				beforeMessage: '_getting marks from database_',
				function: mark.get_marks,
			},
			{
				name: 'deleteHistory',
				description: 'call this tool to Delete the history of the chat, this will make you forget evrything',
				parameters: z.object({}),
				beforeMessage: '_deleting history_',
				function: messageDB.deleteHistory,
			},
			{
				name: 'comfirmMessage',
				parameters: confirmMessageSchema,
				description:
					'Send a message with two buttons, option1 has string, that user will click and option2 has string, that user will click',
				function: whatsapp.comfirmMessage,
			},
		],
		db,
		Message,
		openaiKey,
		whatsapp
	);

	const [, , audioPromise] = await Promise.allSettled([
		whatsapp.markAsRead(messagearr[0].id),
		whatsapp.sendReaction(messagearr[0].id, '\uD83D\uDD04'),
		whatsapp.getAudio(audioObj.id),
		messageDB.loadMessage(Message),
	]);

	if (audioPromise.status === 'rejected') {
		await whatsapp.sendTextMessage('Failed to get audio');
		return c.json('sucess', 200);
	}

	const file = await returnAudioFile(audioPromise.value.arrayBuffer());

	const [, texttranscriptPromise] = await Promise.allSettled([
		whatsapp.sendTextMessage('_Transcribing audio..._'),
		openai.audio.transcriptions.create({
			file,
			model: 'whisper-1',
		}),
	]);

	if (texttranscriptPromise.status === 'rejected') {
		await whatsapp.sendTextMessage('_Failed to transcribe audio_');
		return c.json('sucess', 200);
	}

	const texttranscript = texttranscriptPromise.value;
	console.log(`TTS : ${texttranscript.text}`);
	const text = texttranscript.text;

	Message.push({
		role: 'user',
		content: text,
	});

	const [, completionPromise] = await Promise.allSettled([
		whatsapp.sendTextMessage('_thinking..._'),
		openai.beta.chat.completions.parse({
			messages: Message,
			tools: executeTools.genrateTools(),
			model: 'gpt-4o-mini-2024-07-18',
			parallel_tool_calls: false,
		}),
		messageDB.saveMessage([{ role: 'user', content: text }]),
	]);

	if (completionPromise.status === 'rejected') {
		console.log(completionPromise.reason);
		await Promise.allSettled([
			whatsapp.sendTextMessage(' failed to get response from outer'),
			whatsapp.sendTextMessage(completionPromise.reason),
		]);

		return c.json('sucess', 200);
	}
	const completion = completionPromise.value;
	const tools = completion.choices[0].message.tool_calls;

	if (tools.length > 0) {
		await executeTools.executeTools(tools);
		console.log('Message (tool)', JSON.stringify(Message, null, 2));
		return c.json('sucess', 200);
	}
	const message = completion.choices[0].message.content;

	if (message) {
		await Promise.allSettled([whatsapp.sendTextMessage(message), messageDB.saveMessage([{ role: 'assistant', content: message }])]);
		Message.push({
			role: 'assistant',
			content: message,
		});
		console.log('Message (text)', JSON.stringify(Message, null, 2));
	} else {
		await whatsapp.sendTextMessage('_No response from the model_');
	}
}
