import { useMutation } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Button } from "./ui";
import type { AuthUserDTO } from "@chorechampz/shared";

// One-time post-signup modal capturing the household-tool + no-cash-value
// acknowledgements that used to live as inline checkboxes on the signup form.
// Server-side audit rows are written via /auth/household-ack so the legal trail
// matches the pre-consolidation behavior.
export function HouseholdAckModal({
  open,
  onAcknowledged,
}: {
  open: boolean;
  onAcknowledged: (user: AuthUserDTO) => void;
}) {
  const ack = useMutation({
    mutationFn: () => api<{ user: AuthUserDTO }>("/auth/household-ack", { body: {} }),
    onSuccess: (r) => onAcknowledged(r.user),
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
        <div className="text-4xl text-center">👋</div>
        <h2 className="text-xl font-semibold text-center">How ChoreChampz works</h2>
        <ul className="text-sm text-slate-600 space-y-3">
          <li className="flex gap-2">
            <span aria-hidden>✅</span>
            <span>
              <strong>You stay in control.</strong> Parents approve every task and reward — the app keeps the
              list, you call the shots.
            </span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden>🪙</span>
            <span>
              <strong>Credits are your family's currency.</strong> They have no cash value, aren't money or
              wages, and rewards are funded entirely by you.
            </span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden>📱</span>
            <span>
              <strong>Household tool, not a service.</strong> ChoreChampz isn't childcare, therapy, medical,
              financial, or emergency support. Notifications aren't guaranteed delivery.
            </span>
          </li>
        </ul>
        {ack.isError && <div className="text-sm text-rose-600">Could not save. Try again.</div>}
        <Button className="w-full" onClick={() => ack.mutate()} disabled={ack.isPending}>
          {ack.isPending ? "Saving…" : "Got it"}
        </Button>
      </div>
    </div>
  );
}
