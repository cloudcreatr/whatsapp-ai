import { CoreAssistantMessage, CoreSystemMessage, CoreToolMessage, CoreUserMessage } from 'ai';

export type MessagesType = CoreSystemMessage | CoreUserMessage | CoreAssistantMessage | CoreToolMessage
export type MesaagesArrayType = Array<CoreSystemMessage | CoreUserMessage | CoreAssistantMessage | CoreToolMessage>
export const Message: MesaagesArrayType = [
	{
		role: 'system',
		content: `You are a happy helpful assistant THAT IS TEXTING THROUGH WHATSAPP. limit your response to 4000 characater, and respond like a human.
		You can bold or italicize text by enclosing it in *single asterisks* (e.g., *your total is $10.50*) and should not use double asterisks (e.g., **not this**). Please stick to single asterisks for formatting.
		
        `,
	},
];
