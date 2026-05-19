import { escapeHtml, layoutHtml } from "./layout.js";
import type { RenderedEmail } from "./invitation.js";

export interface NotificationTemplateInput {
  title: string;
  body?: string | null;
}

export function renderNotificationEmail(input: NotificationTemplateInput): RenderedEmail {
  const subject = input.title;
  const bodyHtml = `
    <p style="font-size:17px;font-weight:600;margin:0 0 12px 0;">${escapeHtml(input.title)}</p>
    ${input.body ? `<p style="white-space:pre-wrap;">${escapeHtml(input.body)}</p>` : ""}
    <p style="color:#475569;font-size:13px;margin-top:24px;">Open ChoreChampz to see the details and respond.</p>
  `;
  const text = [input.title, input.body ?? "", "", "Open ChoreChampz to see the details."]
    .filter((s) => s !== "")
    .join("\n");
  return { subject, html: layoutHtml({ title: subject, previewText: subject, bodyHtml }), text };
}
