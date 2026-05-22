// Anti-enumeration helper for auth flows that always respond 200 to prevent
// leaking which emails map to real accounts. A 500 bubbling up from the email
// provider (e.g. Resend domain not verified, transient SMTP error) would
// distinguish "real account, send failed" from the silent no-op we use for
// unknown emails. Wrapping the send call in this helper swallows the error
// and logs it loudly so prod failures stay investigable.

export interface SwallowedSendContext {
  label: string;
  userId?: string;
  to?: string;
}

export async function safelySendEmail(
  send: () => Promise<void>,
  ctx: SwallowedSendContext,
): Promise<{ ok: true } | { ok: false; error: unknown }> {
  try {
    await send();
    return { ok: true };
  } catch (e) {
    console.error(`[${ctx.label}] email send failed`, {
      userId: ctx.userId,
      to: ctx.to,
      err: e,
    });
    return { ok: false, error: e };
  }
}
