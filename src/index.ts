import { Hono } from 'hono';
import { WhatsApp } from './messageClass';

import { drizzle } from 'drizzle-orm/d1';

import { isAudio } from './util/util';
import { webhookComponent } from './webhokkComponents';

import { HandleMessage } from './chat/handleMessage';

const app = new Hono<{
	Bindings: Env;
}>();

// app.get('/message', async (c) => {
// 	const whatsapp = new WhatsApp('917666235448', c.env['wa-id'], c.env['wa-token']);
// 	await whatsapp.sendOptionList({
// 		button: 'Select students',
// 		head: 'Students from ETC Branch',
// 		body: 'Select the students from the list',
// 		footer: 'Select the students from the list',
// 		section: [
// 			{
// 				title: 'ETC 1st Year',
// 				rows: [
// 					{
// 						id: '1',
// 						title: 'Student 1',
// 						description: 'ETC 1st Year',
// 					},
// 					{
// 						id: '2',
// 						title: 'Student 2',
// 						description: 'ETC 1st Year',
// 					},
// 					{
// 						id: '3',
// 						title: 'Student 3',
// 						description: 'ETC 1st Year',
// 					},
// 				],
// 			},
// 			{
// 				title: 'ETC 2nd Year',
// 				rows: [
// 					{
// 						id: '4',
// 						title: 'Student 4',
// 						description: 'ETC 2nd Year',
// 					},
// 					{
// 						id: '5',
// 						title: 'Student 5',
// 						description: 'ETC 2nd Year',
// 					},
// 					{
// 						id: '6',
// 						title: 'Student 6',
// 						description: 'ETC 2nd Year',
// 					},
// 				],
// 			},
// 		],
// 	});

// 	return c.text('Message', 200);
// });

app.get('/', async (c) => {
	const hub_challenge = c.req.query('hub.challenge');
	const hub_verify_token = c.req.query('hub.verify_token');
	if (!hub_challenge || !hub_verify_token) {
		return c.text('Invalid request', 400);
	}
	if (hub_verify_token === c.env.hub.verify_token) {
		return c.text(hub_challenge, 200);
	}
});

app.post('/', async (c) => {
	try {
		const payload: webhookComponent = await c.req.json();

		const messagearr = payload.entry[0].changes[0].value.messages;
		const db = drizzle(c.env.DB);

		if (messagearr && messagearr.length > 0) {
			console.log(payload.entry[0].changes[0].value.contacts[0].wa_id);
			const whatsapp = new WhatsApp(payload.entry[0].changes[0].value.contacts[0].wa_id, c.env['wa-id'], c.env['wa-token']);

			const handleMessage = new HandleMessage({
				db,
				openaikey: c.env.openai,
				whatsapp,
				emailToken: c.env.resend,
				FromEmail: 'ai@cloudcreatr.com',
			});

			// 	{
			// 		name: 'add_marks',
			// 		parameters: marks_obj,
			// 		description: 'Add marks to the database',
			// 		beforeMessage: '_adding marks to database_',
			// 		function: mark.add_marks,
			// 	},
			// 	{
			// 		name: 'get_marks',
			// 		parameters: get_marks_schema,
			// 		description: 'Get marks from the database',
			// 		beforeMessage: '_getting marks from database_',
			// 		function: mark.get_marks,
			// 	},
			// 	{
			// 		name: 'deleteHistory',
			// 		description: 'call this tool to Delete the history of the chat, this will make you forget evrything',
			// 		parameters: z.object({}),
			// 		beforeMessage: '_deleting history_',
			// 		function: messageDB.deleteHistory,
			// 	},
			// 	{
			// 		name: 'comfirmMessage',
			// 		parameters: confirmMessageSchema,
			// 		description:
			// 			'Send a message with two buttons, option1 has string(MAX 20 character), that user will click and option2 has string (MAX 20 Character), that user will click',
			// 		function: whatsapp.comfirmMessage,
			// 	},
			// 	{
			// 		name: 'sendEmail',
			// 		parameters: sendEmailSchema,
			// 		beforeMessage: '_sending email_',
			// 		description:
			// 			'Sends an email to the provided email address, only call this tool if you have confirmed to send this email and its content through comfirmMessage',
			// 		function: email.sendEmail,
			// 	},
			// ];
			const text = messagearr[0].text?.body;
			const interactive = messagearr[0].interactive;

			if (isAudio(messagearr)) {
				const audioObj = messagearr[0].audio;
				if (audioObj) {
					try {
						await handleMessage.handleAudio(audioObj.id, messagearr[0].id);
						return c.json('sucess', 200);
					} catch (e) {
						console.log(`Audio Error: ${e}`);
					}
				}
			} else if (text) {
				try {
					await handleMessage.handleText(text, messagearr[0].id);
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
			} else if (interactive && interactive.type === 'list_reply') {
				console.log('interactive', interactive);
			}
		}
	} catch (e) {
		console.log(`Critical Error: ${e}`);
	}
	return c.json('sucess', 200);
});

export default app;
