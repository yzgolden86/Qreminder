import type { MailerAdapter, MailMessage } from "@renewlet/server";

export interface ResendConfig {
  apiKey: string;
  from: string;
}

export function createResendAdapter(config: ResendConfig): MailerAdapter {
  return {
    async send(message: MailMessage) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: config.from,
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html,
          reply_to: message.replyTo,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Resend API error ${res.status}: ${body}`);
      }
      const data = (await res.json()) as { id: string };
      return { id: data.id };
    },
  };
}
