import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";

interface Props {
  email: string | null | undefined;
}

export function EmailVerifyBanner({ email }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const [sent, setSent] = useState(false);
  const resend = useMutation({
    mutationFn: () => api("/auth/verify-email/resend", { method: "POST", body: {} }),
    onSuccess: () => setSent(true),
  });

  if (dismissed || !email) return null;

  return (
    <div className="bg-amber-100 border-b border-amber-200 text-amber-900 text-sm px-4 py-1.5 text-center">
      {sent ? (
        <>
          Verification email sent to <strong>{email}</strong>. Check your inbox.
        </>
      ) : (
        <>
          Verify your email (<strong>{email}</strong>) to unlock account recovery.{" "}
          <button
            type="button"
            onClick={() => resend.mutate()}
            disabled={resend.isPending}
            className="font-semibold underline hover:no-underline disabled:opacity-50"
          >
            {resend.isPending ? "Sending…" : "Resend"}
          </button>
          {" · "}
          <button type="button" onClick={() => setDismissed(true)} className="text-amber-700 hover:underline">
            Dismiss
          </button>
        </>
      )}
    </div>
  );
}
