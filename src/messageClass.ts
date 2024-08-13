import { z } from 'zod';

export interface uploadResponse {
    id: string;
}

export interface reterivemedia {
    messaging_product: 'whatsapp';
    url: string;
    mime_type: string;
    sha256: string;
    file_size: string;
    id: string;
}

export interface sendListOption {
    type: 'list';
    header: {
        type: 'text';
        text: string;
    };
    body: {
        text: string;
    };
    footer: {
        text: string;
    };
    action: {
        sections: {
            title: string;
            rows: {
                id: string;
                title: string;
                description?: string;
            }[];
        }[];
        button: string;
    };
}

export const sendOptionListSchema = z.object({
    button: z
        .string()
        .describe(
            'Button label text. When tapped, reveals rows (options the WhatsApp user can tap). Supports a single button. think of it as button text that will trigger the modal to show all option list'
        ),
    head: z.string().describe('A text for head, Maximum 60 characters.'),
    body: z.string().describe('A text for body, Maximum 4096 characters'),
    footer: z.string().describe('A text for footer, Maximum 60 characters'),
    section: z
        .array(
            z.object({
                title: z.string().describe('Section title text. Maximum 24 characters.'),
                rows: z
                    .array(
                        z.object({
                            id: z
                                .string()
                                .describe(
                                    'Arbitrary string identifying the row. This ID will be included in the message given by user if the user submits the selection. Maximum 200 characters.'
                                ),
                            title: z.string().describe('row title, Maximum 24 characters'),
                            description: z.string().optional().describe('row description, Maximum 72 characters'),
                        })
                    )
                    .describe('At least one row is required. Supports up to 10 rows'),
            })
        )
        .describe(' At least 1 section is required. Supports up to 10 sections'),
});

interface confirmMessage {
    type: 'button';
    body: {
        text: string;
    };
    footer?: {
        text: string;
    };
    action: {
        buttons: Array<{
            type: 'reply';
            reply: {
                id: string;
                title: string;
            };
        }>;
    };
}

export const confirmMessageSchema = z.object({
    option1: z.string().describe('A text for button 1, MAX 20 characters'),
    option2: z.string().describe('A text for button 2, MAX 20 characters'),
    footer: z.string().optional().describe('A text for footer'),
    body: z.string().describe('A text for body'),
});

export class WhatsApp {
    private to: string;
    private WHATSAPP_BUSINESS_PHONE_NUMBER_ID: string;
    private token: string;
    
    constructor(to: string, WHATSAPP_BUSINESS_PHONE_NUMBER_ID: string, token: string) {
        this.to = to;
        this.WHATSAPP_BUSINESS_PHONE_NUMBER_ID = WHATSAPP_BUSINESS_PHONE_NUMBER_ID;
        this.token = token;
    }
    async sendRequest(type: string, payload: any) {
          try {
              const response = await fetch(`https://graph.facebook.com/v20.0/${this.WHATSAPP_BUSINESS_PHONE_NUMBER_ID}/messages`, {
                  method: 'POST',
                  headers: {
                      'Content-Type': 'application/json',
                      Authorization: `Bearer ${this.token}`,
                  },
                  body: JSON.stringify({
                      messaging_product: 'whatsapp',
                      recipient_type: 'individual',
                      to: this.to,
                      type: type,
                      [type]: payload,
                  }),
              });
              return response;
          } catch (e) {
              console.log('Fetch Error: ', e);
          }
      }

    async downLoadImage(id: string) {
        const response = await fetch(`https://graph.facebook.com/v20.0/${id}?phone_number_id=${this.WHATSAPP_BUSINESS_PHONE_NUMBER_ID}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',

                Authorization: `Bearer ${this.token}`,
            },
        });
        const data = (await response.json()) as reterivemedia;
        const url = data.url;
        const response2 = await fetch(url, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${this.token}`,
                'User-Agent': 'cloudcreatr',
            },
        });
        return { stream: response2.body, mime: data.mime_type };
    }

    async getAudio(id: string) {
        const response = await fetch(`https://graph.facebook.com/v20.0/${id}?phone_number_id=${this.WHATSAPP_BUSINESS_PHONE_NUMBER_ID}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',

                Authorization: `Bearer ${this.token}`,
            },
        });

        const data = (await response.json()) as reterivemedia;

        const url = data.url;

        const audioRes = await fetch(url, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${this.token}`,
                'User-Agent': 'cloudcreatr',
            },
        });

        return audioRes;
    }

    async sendReaction(messageId: string, emoji: string) {
        await this.sendRequest('reaction', { message_id: messageId, emoji });
    }

    async markAsRead(messageId: string) {
        try {
            const response = await fetch(`https://graph.facebook.com/v20.0/${this.WHATSAPP_BUSINESS_PHONE_NUMBER_ID}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.token}`,
                },
                body: JSON.stringify({
                    messaging_product: 'whatsapp',
                    status: 'read',
                    message_id: messageId,
                }),
            });
        } catch (e) {
            console.log('Fetch Error: ', e);
        }
    }

    comfirmMessage = async ({ option1, option2, footer, body }: z.infer<typeof confirmMessageSchema>) => {
        console.log('comfirmMessage', option1, option2, footer, body);
        const obj: confirmMessage = {
            type: 'button',
            body: {
                text: body,
            },
            action: {
                buttons: [
                    {
                        type: 'reply',
                        reply: {
                            id: '1',
                            title: option1,
                        },
                    },
                    {
                        type: 'reply',
                        reply: {
                            id: '2',
                            title: option2,
                        },
                    },
                ],
            },
        };
        if (footer) {
            obj.footer = {
                text: footer,
            };
        }

        const response = await this.sendRequest('interactive', obj);
        console.log('response', await response?.json());
        return 'Message sent';
    };

    async sendTextMessage(text: string) {
        await this.sendRequest('text', { body: text });
    }

    async sendOptionList({ button, head, body, footer, section }: z.infer<typeof sendOptionListSchema>) {
        const obj: sendListOption = {
            type: "list",
            header: {
                type: "text",
                text: head
            },
            body: {
                text: body
            },
            footer: {
                text: footer
            },
            action: {
                sections: section,
                button: button
            }
        };

        const res = await this.sendRequest('interactive', obj);
		console.log('res', await res?.json());
    }

    async sendAudioMessage(audio: { id?: string; url?: string }) {
        if (audio.id) {
            await this.sendRequest('audio', { id: audio.id });
        } else {
            await this.sendRequest('audio', { url: audio.url });
        }
    }
}