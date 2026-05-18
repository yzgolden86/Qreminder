export interface MailMessage {
  to: string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

export interface MailerAdapter {
  send(message: MailMessage): Promise<{ id: string }>;
}
