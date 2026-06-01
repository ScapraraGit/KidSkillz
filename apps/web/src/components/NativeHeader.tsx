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
export function NativeHeader({ title, role }: { title: string; role: "PARENT" | "CHILD" }) {
  const user = useAuth((s) => s.user);
  const nav = useNavigate();

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200 pt-safe">
      <div className="h-12 px-3 flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold tracking-tight text-slate-900 truncate">{title}</h1>
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
