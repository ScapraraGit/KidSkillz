import { useNavigate } from "react-router-dom";
import { useAuth } from "../store/auth";
import { NotificationBell } from "./NotificationBell";
import { SoundToggle } from "./SoundToggle";
import { KidAvatar } from "./KidAvatar";
import { Tooltip } from "./Tooltip";
import { haptic } from "../lib/native";

// Native-only contextual title bar. Replaces the persistent "🪙 ChoreChampz"
// brand bar (the single biggest "this is a website" tell) with the CURRENT
// screen's title — the iOS/Android nav-bar convention. The avatar routes to the
// More tab instead of opening a corner dropdown. `pt-safe` lets the white bar
// paint under the status-bar inset; `sticky` keeps the title on scroll.
//
// Back button: React Router 6 stores the navigation depth in
// `window.history.state.idx`. When > 0 the user navigated there from within
// the app (not a cold launch), so a back chevron is meaningful.
export function NativeHeader({ title, role }: { title: string; role: "PARENT" | "CHILD" }) {
  const user = useAuth((s) => s.user);
  const nav = useNavigate();
  const canGoBack = (window.history.state?.idx ?? 0) > 0;

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200 pt-safe">
      <div className="h-12 px-3 flex items-center gap-1">
        {canGoBack && (
          <Tooltip label="Go back" side="bottom">
            <button
              type="button"
              aria-label="Go back"
              onClick={() => {
                void haptic("light");
                nav(-1);
              }}
              className="shrink-0 -ml-1 p-2 rounded-lg active:bg-slate-100 transition text-slate-700"
            >
              <BackChevron />
            </button>
          </Tooltip>
        )}

        <h1 className="flex-1 text-lg font-semibold tracking-tight text-slate-900 truncate">{title}</h1>

        <div className="flex items-center gap-1 shrink-0">
          <NotificationBell />
          {role === "CHILD" && <SoundToggle />}
          {user && (
            <Tooltip label="Account & more" side="bottom">
              <button
                type="button"
                data-tour="account-menu"
                aria-label="Account and more"
                onClick={() => {
                  void haptic("light");
                  nav("/more");
                }}
                className="rounded-full p-0.5 active:scale-95 transition"
              >
                <KidAvatar name={user.name} color={user.avatarColor} config={user.avatarConfig} size={32} />
              </button>
            </Tooltip>
          )}
        </div>
      </div>
    </header>
  );
}

function BackChevron() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}
