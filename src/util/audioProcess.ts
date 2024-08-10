export async function returnAudioFile(buffer: Promise<ArrayBuffer>) {
	// Get the audio data as an ArrayBuffer
	const audioArrayBuffer = await buffer
	return new File([audioArrayBuffer], 'audio.ogg', { type: 'audio/ogg' });
}
