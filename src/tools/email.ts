import { Resend } from 'resend';
import { z } from 'zod';

export const sendEmailSchema = z.object({
	to: z.string().describe('Email to send to'),
	subject: z.string().describe('Email subject'),
	body: z.string().describe('Email body'),
});

export class Email {
	private token: string;
	private email: string;
	private resend: InstanceType<typeof Resend>;

	constructor(token: string, email: string) {
		this.token = token;
		this.email = email;
		this.resend = new Resend(token);
	}

	sendEmail = async ({ to, subject, body }: z.infer<typeof sendEmailSchema>) => {
		try {
			await this.resend.emails.send({
				from: this.email,
				to,
				subject: subject,
				text: body,
			});
			return 'Email sent';
		} catch (error) {
			console.log('Error in sending email', error);
			return 'Error in sending email';
		}
	};
}
