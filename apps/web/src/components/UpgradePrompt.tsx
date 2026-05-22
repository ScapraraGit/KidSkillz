import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card } from "./ui";

const BILLING_UI = (import.meta.env.VITE_BILLING_ENABLED as string) === "true";

interface PromptState {
  code: string;
  message: string;
}

/**
 * Global modal that listens for `billing:required` events dispatched by the
 * api.ts fetch wrapper on any 402 response. Lets pages stay ignorant of
 * billing — they just make API calls and let the modal handle the upsell.
 */
export function UpgradePrompt() {
  const [state, setState] = useState<PromptState | null>(null);
  useEffect(() => {
    if (!BILLING_UI) return;
    function handler(ev: Event) {
      const ce = ev as CustomEvent<PromptState>;
      setState(ce.detail);
    }
    window.addEventListener("billing:required", handler);
    return () => window.removeEventListener("billing:required", handler);
  }, []);
  if (!BILLING_UI || !state) return null;
  const isPremium = state.code === "PREMIUM_REQUIRED";
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <h2 className="text-lg font-semibold mb-2">
          {isPremium ? "Premium plan required" : "Subscription required"}
        </h2>
        <p className="text-sm text-slate-600 mb-4">
          {isPremium
            ? "This feature is on the Premium plan. Upgrade to continue."
            : "Your trial has ended. Choose a plan to keep using ChoreChampz."}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setState(null)}>
            Not now
          </Button>
          <Link to="/parent/settings#billing" onClick={() => setState(null)}>
            <Button>See plans</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
