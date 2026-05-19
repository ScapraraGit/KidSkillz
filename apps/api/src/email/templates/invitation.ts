import { buttonHtml, escapeHtml, layoutHtml } from "./layout.js";

export interface InvitationTemplateInput {
  inviterName: string;
  familyName: string;
  acceptUrl: string;
  kind: "CO_PARENT" | "CAREGIVER";
  validFrom?: Date | null;
  validUntil?: Date | null;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function formatWindow(from?: Date | null, until?: Date | null): string | null {
  if (!from && !until) return null;
  const fmt = (d: Date) => d.toUTCString();
  if (from && until) return `Access window: ${fmt(from)} → ${fmt(until)}`;
  if (from) return `Access starts: ${fmt(from)}`;
  return `Access ends: ${fmt(until!)}`;
}

export function renderInvitationEmail(input: InvitationTemplateInput): RenderedEmail {
  const roleLabel = input.kind === "CO_PARENT" ? "co-parent" : "caregiver";
  const subject = `${input.inviterName} invited you to join ${input.familyName} on ChoreChampz`;
  const window = formatWindow(input.validFrom, input.validUntil);

  const bodyHtml = `
    <p>Hi,</p>
    <p><strong>${escapeHtml(input.inviterName)}</strong> invited you to join the <strong>${escapeHtml(input.familyName)}</strong> family on ChoreChampz as a <strong>${escapeHtml(roleLabel)}</strong>.</p>
    ${buttonHtml(input.acceptUrl, "Accept invitation")}
    <p style="color:#475569;font-size:13px;">Or paste this link into your browser:<br/><a href="${escapeHtml(input.acceptUrl)}" style="color:#6366f1;word-break:break-all;">${escapeHtml(input.acceptUrl)}</a></p>
    ${window ? `<p style="color:#475569;font-size:13px;">${escapeHtml(window)}</p>` : ""}
    <p style="color:#475569;font-size:13px;">This invitation will expire for security. If it does, ask ${escapeHtml(input.inviterName)} to send a new one.</p>
  `;

  const text = [
    `${input.inviterName} invited you to join the ${input.familyName} family on ChoreChampz as a ${roleLabel}.`,
    "",
    `Accept the invitation: ${input.acceptUrl}`,
    window ? "" : null,
    window,
    "",
    "If you didn't expect this email, you can ignore it.",
  ]
    .filter((line) => line !== null)
    .join("\n");

  return { subject, html: layoutHtml({ title: subject, previewText: subject, bodyHtml }), text };
}
