import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../store/auth";
import { Button } from "./ui";
import { CURRENT_TERMS_VERSION, type AuthUserDTO } from "@chorechampz/shared";

/**
 * Blocking modal shown when the signed-in user's acceptedTermsVersion is missing or stale.
 * Forces re-acceptance before any further app interaction. Caregivers + kids skip — only
 * the account-holder (PARENT) needs to re-accept on material updates.
 */
export function TermsGate({ user }: { user: AuthUserDTO }) {
  const setUser = useAuth((s) => s.setUser);
  const accept = useMutation({
    mutationFn: () =>
      api<{ user: AuthUserDTO }>("/auth/accept-terms", {
        body: { version: CURRENT_TERMS_VERSION },
      }),
    onSuccess: (r) => setUser(r.user),
  });

  if (user.role !== "PARENT") return null;
  const current = user.acceptedTermsVersion ?? 0;
  if (current >= CURRENT_TERMS_VERSION) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
        <h2 className="text-xl font-semibold">We've updated our terms</h2>
        <p className="text-sm text-slate-600">
          Our{" "}
          <Link to="/terms" target="_blank" className="text-brand-600 hover:underline">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link to="/privacy" target="_blank" className="text-brand-600 hover:underline">
            Privacy Policy
          </Link>{" "}
          have changed. Please review and accept to continue.
        </p>
        {accept.isError && <div className="text-sm text-rose-600">Could not save. Try again.</div>}
        <div className="flex justify-end">
          <Button onClick={() => accept.mutate()} disabled={accept.isPending}>
            {accept.isPending ? "Saving…" : "I accept"}
          </Button>
        </div>
      </div>
    </div>
  );
}
