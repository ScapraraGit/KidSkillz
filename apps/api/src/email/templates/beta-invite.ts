import { buttonHtml, escapeHtml, layoutHtml } from "./layout.js";

export interface BetaInviteTemplateInput {
  recipientName?: string | null;
  checklistUrl: string;
  feedbackUrl: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function renderBetaInviteEmail(input: BetaInviteTemplateInput): RenderedEmail {
  const greeting = input.recipientName ? `Hi ${input.recipientName},` : "Hi there,";
  const subject = "Help shape ChoreChampz — 10 minutes of beta testing?";

  const bodyHtml = `
    <p>${escapeHtml(greeting)}</p>
    <p>Thanks for trying <strong>ChoreChampz</strong> — a small app to help families turn chores, initiative, and rewards into something kids actually want to do.</p>
    <p>We're in beta, and your honest feedback is the single most useful thing we could get right now. The whole flow takes about <strong>10–15 minutes</strong>.</p>
    <p>Here's how to help:</p>
    <ol style="padding-left:20px;margin:8px 0 16px;">
      <li>Walk through the suggested checklist (create a family, add a kid, run a chore, redeem a reward).</li>
      <li>Try it on your phone <em>and</em> your computer if you can.</li>
      <li>Tell us what worked, what didn't, and what you wish existed.</li>
    </ol>
    ${buttonHtml(input.checklistUrl, "Open the beta checklist")}
    <p style="color:#475569;font-size:13px;">Or jump straight to feedback: <a href="${escapeHtml(input.feedbackUrl)}" style="color:#6366f1;">${escapeHtml(input.feedbackUrl)}</a></p>
    <p>No filter required. The blunter, the better — we'd rather hear "this confused me" today than ship something nobody uses next month.</p>
    <p>Really — thank you. Every bit of feedback shapes what this becomes.</p>
    <p style="margin-top:18px;">— The ChoreChampz team</p>
  `;

  const text = [
    greeting,
    "",
    "Thanks for trying ChoreChampz — a small app to help families turn chores, initiative, and rewards into something kids actually want to do.",
    "",
    "We're in beta and your honest feedback is the most useful thing we could get right now. The whole flow takes about 10–15 minutes.",
    "",
    "How to help:",
    "  1. Walk through the suggested checklist (create a family, add a kid, run a chore, redeem a reward).",
    "  2. Try it on your phone and your computer if you can.",
    "  3. Tell us what worked, what didn't, and what you wish existed.",
    "",
    `Beta checklist: ${input.checklistUrl}`,
    `Feedback form:  ${input.feedbackUrl}`,
    "",
    "No filter required. The blunter, the better.",
    "",
    "— The ChoreChampz team",
  ].join("\n");

  return { subject, html: layoutHtml({ title: subject, previewText: subject, bodyHtml }), text };
}
