import { useState, type ReactNode } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import { useAuth } from "../store/auth";
import { api } from "../lib/api";
import { haptic } from "../lib/native";
import { NavIcon } from "../components/NavIcon";
import { FamilySwitcher } from "../components/FamilySwitcher";
import { AvatarStudio } from "../components/AvatarStudio";
import { Tooltip } from "../components/Tooltip";
import type { AppLayoutOutletContext } from "../lib/nav";

// Native-only "More" tab. Holds the nav destinations that don't fit the 4-slot
// bottom bar (Rewards, Challenges, Members, …) plus the account actions that
// used to live in the cramped corner popover (family switch, edit avatar,
// settings, beta, sign out). Reached via the avatar in NativeHeader and the
// More tab. Renders fine on web too, but nothing links there outside native.
export function More() {
  const ctx = useOutletContext<AppLayoutOutletContext>();
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const nav = useNavigate();
  const [studioOpen, setStudioOpen] = useState(false);

  const { links, primaryRoutes, role, isCaregiver, isBeta } = ctx;
  // Everything that didn't earn a bottom-tab slot.
  const overflow = links.filter((l) => !primaryRoutes.includes(l.to));

  async function signOut() {
    void haptic("light");
    // Best-effort refresh-token revoke so a stolen one can't outlive sign-out.
    const rt = useAuth.getState().refreshToken;
    if (rt) {
      try {
        await api("/auth/logout", { body: { refreshToken: rt } });
      } catch {
        /* ignore — logging out locally regardless */
      }
    }
    logout();
    nav("/login");
  }

  return (
    <div className="space-y-6">
      {overflow.length > 0 && (
        <Section title="Browse">
          {overflow.map((l) => (
            <RowLink
              key={l.to}
              to={l.to}
              icon={<NavIcon to={l.to} size={20} />}
              label={l.label}
              tip={l.tip}
            />
          ))}
        </Section>
      )}

      <Section title="Account">
        <FamilySwitcher onSwitched={() => nav(role === "PARENT" ? "/parent" : "/me")} />
        <RowButton
          icon={<AvatarGlyph />}
          label="Edit avatar"
          tip="Customize your avatar"
          onClick={() => setStudioOpen(true)}
        />
        {role === "PARENT" && !isCaregiver && (
          <RowLink
            to="/parent/settings"
            icon={<NavIcon to="/parent/settings" size={20} />}
            label="Settings"
            tip="Family settings, billing, devices, and more"
          />
        )}
        {role === "PARENT" && !isCaregiver && isBeta && (
          <RowLink
            to="/beta"
            icon={<HeartGlyph />}
            label="Beta tester 💜"
            tip="Beta tester hub — checklist and feedback"
          />
        )}
      </Section>

      <Section title="">
        <Tooltip label="Sign out of this device">
          <button
            type="button"
            onClick={signOut}
            className="w-full flex items-center gap-3 px-4 min-h-[52px] text-left text-rose-600 font-medium active:bg-rose-50"
          >
            <SignOutGlyph />
            <span>Sign out</span>
          </button>
        </Tooltip>
      </Section>

      {studioOpen && user && <AvatarStudio user={user} onClose={() => setStudioOpen(false)} />}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      {title && (
        <h2 className="px-1 pb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h2>
      )}
      <div className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden">
        {children}
      </div>
    </section>
  );
}

function RowLink({ to, icon, label, tip }: { to: string; icon: ReactNode; label: string; tip?: string }) {
  return (
    <Tooltip label={tip}>
      <Link
        to={to}
        onClick={() => void haptic("light")}
        className="w-full flex items-center gap-3 px-4 min-h-[52px] text-slate-800 active:bg-slate-50"
      >
        <span className="text-slate-500 shrink-0">{icon}</span>
        <span className="flex-1 font-medium">{label}</span>
        <Chevron />
      </Link>
    </Tooltip>
  );
}

function RowButton({
  icon,
  label,
  tip,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  tip?: string;
  onClick: () => void;
}) {
  return (
    <Tooltip label={tip}>
      <button
        type="button"
        onClick={() => {
          void haptic("light");
          onClick();
        }}
        className="w-full flex items-center gap-3 px-4 min-h-[52px] text-left text-slate-800 active:bg-slate-50"
      >
        <span className="text-slate-500 shrink-0">{icon}</span>
        <span className="flex-1 font-medium">{label}</span>
        <Chevron />
      </button>
    </Tooltip>
  );
}

function Chevron() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-slate-300 shrink-0"
      aria-hidden="true"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function AvatarGlyph() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  );
}

function HeartGlyph() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20s-7-4.5-7-9.5A3.8 3.8 0 0 1 12 7a3.8 3.8 0 0 1 7 3.5C19 15.5 12 20 12 20Z" />
    </svg>
  );
}

function SignOutGlyph() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}
