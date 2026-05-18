import { createTransport, type Transporter } from "nodemailer";
import type { MailerAdapter, MailMessage } from "@renewlet/server";

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

export function createNodemailerAdapter(config: SmtpConfig): MailerAdapter {
  const transport: Transporter = createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
  });

  return {
    async send(message: MailMessage) {
      const info = await transport.sendMail({
        from: config.from,
        to: message.to.join(", "),
        subject: message.subject,
        text: message.text,
        html: message.html,
        replyTo: message.replyTo,
      });
      return { id: info.messageId ?? "" };
    },
  };
}
