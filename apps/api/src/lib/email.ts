import { emailProvider } from "./email-provider.js";
import { renderInvitationEmail } from "../email/templates/invitation.js";
import { renderVerificationEmail } from "../email/templates/verification.js";
import { renderPasswordResetEmail } from "../email/templates/password-reset.js";
import { renderNotificationEmail } from "../email/templates/notification.js";
import { renderBetaInviteEmail } from "../email/templates/beta-invite.js";

// Public surface: keep the existing signatures so call sites in auth-tokens.ts,
// invitations.ts, and notifications.ts don't change. Behavior:
//  - EMAIL_ENABLED=true → render template, send via Resend.
//  - EMAIL_ENABLED=false → ConsoleProvider logs send. Auth flows still log a
//    usable URL so dev/local testing of verify/reset works without Resend.
//  - Verification/reset/invitation rethrow on failure (user is actively
//    waiting); notification swallows (fire-and-forget mirror of in-app alert).

export interface InvitationEmailParams {
  to: string;
  inviterName: string;
  familyName: string;
  acceptUrl: string;
  kind: "CO_PARENT" | "CAREGIVER";
  validFrom?: Date | null;
  validUntil?: Date | null;
}

export async function sendInvitationEmail(params: InvitationEmailParams): Promise<void> {
  const rendered = renderInvitationEmail({
    inviterName: params.inviterName,
    familyName: params.familyName,
    acceptUrl: params.acceptUrl,
    kind: params.kind,
    validFrom: params.validFrom,
    validUntil: params.validUntil,
  });
  await emailProvider.send({
    to: params.to,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    tags: { type: "invitation", kind: params.kind },
  });
}

export async function sendVerificationEmail(params: { to: string; verifyUrl: string }): Promise<void> {
  // eslint-disable-next-line no-console
  console.log("[email:verify]", { to: params.to, verifyUrl: params.verifyUrl });
  const rendered = renderVerificationEmail({ verifyUrl: params.verifyUrl });
  await emailProvider.send({
    to: params.to,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    tags: { type: "verification" },
  });
}

export async function sendPasswordResetEmail(params: { to: string; resetUrl: string }): Promise<void> {
  // eslint-disable-next-line no-console
  console.log("[email:reset]", { to: params.to, resetUrl: params.resetUrl });
  const rendered = renderPasswordResetEmail({ resetUrl: params.resetUrl });
  await emailProvider.send({
    to: params.to,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    tags: { type: "password_reset" },
  });
}

export interface BetaInviteEmailParams {
  to: string;
  recipientName?: string | null;
  checklistUrl: string;
  feedbackUrl: string;
}

// Rethrows on provider error — beta invites are typically sent from a script /
// admin tool where the caller wants to know about failed sends. Mirror of
// invitation email semantics.
export async function sendBetaInviteEmail(params: BetaInviteEmailParams): Promise<void> {
  const rendered = renderBetaInviteEmail({
    recipientName: params.recipientName ?? null,
    checklistUrl: params.checklistUrl,
    feedbackUrl: params.feedbackUrl,
  });
  await emailProvider.send({
    to: params.to,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    tags: { type: "beta_invite" },
  });
}

export async function sendNotificationEmail(params: {
  to: string;
  title: string;
  body?: string | null;
}): Promise<void> {
  try {
    const rendered = renderNotificationEmail({ title: params.title, body: params.body });
    await emailProvider.send({
      to: params.to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      tags: { type: "notification" },
    });
  } catch (e) {
    // Fire-and-forget — the in-app notification row is already persisted.

    console.error("[email:notification] send failed", e);
  }
}
