import { WhatsApp } from '../messageClass';
import { MessageType } from '../webhokkComponents';

export async function returnErrorMessage({
	PromiseSettledResult,
	Message,
	whatsapp,
}: {
	PromiseSettledResult: PromiseSettledResult<any>;
	Message: string;
	whatsapp: WhatsApp;
}) {
	if (PromiseSettledResult.status === 'rejected') {
		await whatsapp.sendTextMessage(Message);
		throw new Response('sucess', {
			headers: {
				'Content-Type': 'application/json',
			},
			status: 200,
		});
	}
}

export function isAudio(messagearr: MessageType) {
	if (messagearr[0].type === 'audio') {
		return true;
	}
	return false;
}

export function isImage(messagearr: MessageType) {
	if (messagearr[0].type === 'image' && messagearr[0].image) {
		return true;
	}
	return false;
}


export function isDocument(messagearr: MessageType) {
	if (messagearr[0].type === 'document') {
		return true;
	}
	return false;
}

export function isVideo(messagearr: MessageType) {
	if (messagearr[0].type === 'video') {
		return true;
	}
	return false;
}