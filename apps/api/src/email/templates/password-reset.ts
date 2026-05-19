import { buttonHtml, escapeHtml, layoutHtml } from "./layout.js";
import type { RenderedEmail } from "./invitation.js";

export interface PasswordResetTemplateInput {
  resetUrl: string;
}

export function renderPasswordResetEmail(input: PasswordResetTemplateInput): RenderedEmail {
  const subject = "Reset your ChoreChampz password";
  const bodyHtml = `
    <p>We received a request to reset the password on your ChoreChampz account.</p>
    ${buttonHtml(input.resetUrl, "Reset password")}
    <p style="color:#475569;font-size:13px;">Or paste this link into your browser:<br/><a href="${escapeHtml(input.resetUrl)}" style="color:#6366f1;word-break:break-all;">${escapeHtml(input.resetUrl)}</a></p>
    <p style="color:#475569;font-size:13px;"><strong>Didn&rsquo;t request this?</strong> You can ignore this email — your password won&rsquo;t change unless you click the link above. The link expires shortly for your security.</p>
  `;
  const text = [
    "We received a request to reset the password on your ChoreChampz account.",
    "",
    `Reset: ${input.resetUrl}`,
    "",
    "Didn't request this? Ignore this email — your password won't change unless you use the link.",
    "The link expires shortly for security.",
  ].join("\n");
  return { subject, html: layoutHtml({ title: subject, previewText: subject, bodyHtml }), text };
}
