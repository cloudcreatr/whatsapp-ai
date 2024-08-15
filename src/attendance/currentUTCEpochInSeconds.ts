import { z } from 'zod';

export const currentUTCEpochInSecondsSchema = z.object({});
export const DateToUTCEpochInSecondsSchema = z.object({ year: z.number(), month: z.number(), day: z.number() });
export const UTCEpochInSecondsToDateSchema = z.object({ epoch: z.number() });




export function currentUTCEpochInSeconds() {
	return Math.floor(Date.now() / 1000).toString();
}

export function DateToUTCEpochInSeconds({ year, month, day }: z.infer<typeof DateToUTCEpochInSecondsSchema>) {
	const dateObj = new Date(year, month, day);
	return Math.floor(dateObj.getTime() / 1000).toString();
}

export function UTCEpochInSecondsToDate({ epoch }: z.infer<typeof UTCEpochInSecondsToDateSchema>) {
	const date = new Date(epoch * 1000);
	date.setHours(date.getHours() + 5, date.getMinutes() + 30);
	return date.toISOString();
}
