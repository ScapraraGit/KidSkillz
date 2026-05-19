import { buttonHtml, escapeHtml, layoutHtml } from "./layout.js";
import type { RenderedEmail } from "./invitation.js";

export interface VerificationTemplateInput {
  verifyUrl: string;
}

export function renderVerificationEmail(input: VerificationTemplateInput): RenderedEmail {
  const subject = "Verify your ChoreChampz email";
  const bodyHtml = `
    <p>Welcome to ChoreChampz!</p>
    <p>Confirm your email address to activate your account and start tracking chores, rewards, and wins.</p>
    ${buttonHtml(input.verifyUrl, "Verify email")}
    <p style="color:#475569;font-size:13px;">Or paste this link into your browser:<br/><a href="${escapeHtml(input.verifyUrl)}" style="color:#6366f1;word-break:break-all;">${escapeHtml(input.verifyUrl)}</a></p>
    <p style="color:#475569;font-size:13px;">This link expires shortly for your security. If it expires, request a new one from the app.</p>
  `;
  const text = [
    "Welcome to ChoreChampz!",
    "",
    "Confirm your email address to activate your account.",
    "",
    `Verify: ${input.verifyUrl}`,
    "",
    "This link expires shortly. If it expires, request a new one from the app.",
  ].join("\n");
  return { subject, html: layoutHtml({ title: subject, previewText: subject, bodyHtml }), text };
}
