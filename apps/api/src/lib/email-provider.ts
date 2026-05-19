import { Resend } from "resend";
import { env } from "../env.js";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  tags?: Record<string, string>;
}

export interface EmailSendResult {
  id: string;
}

export interface EmailProvider {
  send(msg: EmailMessage): Promise<EmailSendResult>;
}

class ResendProvider implements EmailProvider {
  private client: Resend;
  constructor(apiKey: string) {
    this.client = new Resend(apiKey);
  }
  async send(msg: EmailMessage): Promise<EmailSendResult> {
    const { data, error } = await this.client.emails.send({
      from: env.EMAIL_FROM,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      replyTo: msg.replyTo ?? (env.EMAIL_REPLY_TO || undefined),
      tags: msg.tags ? Object.entries(msg.tags).map(([name, value]) => ({ name, value })) : undefined,
    });
    if (error) {
      throw new Error(`[resend] ${error.name ?? "send_failed"}: ${error.message}`);
    }
    if (!data?.id) {
      throw new Error("[resend] send returned no id");
    }
    return { id: data.id };
  }
}

class ConsoleProvider implements EmailProvider {
  async send(msg: EmailMessage): Promise<EmailSendResult> {
    // eslint-disable-next-line no-console
    console.log("[email:console]", {
      to: msg.to,
      subject: msg.subject,
      tags: msg.tags ?? null,
      textPreview: msg.text.slice(0, 200),
    });
    return { id: `console_${Date.now()}` };
  }
}

function buildProvider(): EmailProvider {
  if (env.EMAIL_ENABLED) {
    if (!env.RESEND_API_KEY) {
      throw new Error("EMAIL_ENABLED=true but RESEND_API_KEY is empty");
    }
    return new ResendProvider(env.RESEND_API_KEY);
  }
  return new ConsoleProvider();
}

export const emailProvider: EmailProvider = buildProvider();
