// v1: log-only stub. Swap with real provider (SES, Resend, Postmark) later.
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
  // eslint-disable-next-line no-console
  console.log("[email:invitation]", {
    to: params.to,
    kind: params.kind,
    family: params.familyName,
    inviter: params.inviterName,
    acceptUrl: params.acceptUrl,
    validFrom: params.validFrom?.toISOString() ?? null,
    validUntil: params.validUntil?.toISOString() ?? null,
  });
}

export async function sendVerificationEmail(params: { to: string; verifyUrl: string }): Promise<void> {
  // eslint-disable-next-line no-console
  console.log("[email:verify]", { to: params.to, verifyUrl: params.verifyUrl });
}

export async function sendPasswordResetEmail(params: { to: string; resetUrl: string }): Promise<void> {
  // eslint-disable-next-line no-console
  console.log("[email:reset]", { to: params.to, resetUrl: params.resetUrl });
}
