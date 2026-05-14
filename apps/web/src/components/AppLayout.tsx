import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../store/auth";
import { api } from "../lib/api";
import { KidAvatar } from "./KidAvatar";
import { AvatarStudio } from "./AvatarStudio";
import { OnboardingTour } from "./OnboardingTour";
import { Tooltip } from "./Tooltip";
import { SoundToggle } from "./SoundToggle";
import { NotificationBell } from "./NotificationBell";
import { Popover } from "./Popover";
import { EmailVerifyBanner } from "./EmailVerifyBanner";
import { TermsGate } from "./TermsGate";
import { LegalFooter } from "./LegalFooter";
import { childTour, parentTour } from "../lib/tours";
import clsx from "clsx";
import type { MeResponseDTO } from "@chorechampz/shared";

interface NavLinkDef {
  to: string;
  label: string;
  end?: boolean;
  id?: string;
  tip?: string;
}

const parentLinks: NavLinkDef[] = [
  { to: "/parent", label: "Dashboard", end: true, tip: "Family overview, balances, recent activity" },
  { to: "/parent/approvals", label: "Approvals", tip: "Review pending chores and redemptions" },
  { to: "/parent/tasks", label: "Tasks", id: "nav-tasks", tip: "Create and manage chore templates" },
  { to: "/parent/rewards", label: "Rewards", id: "nav-rewards", tip: "Manage the reward catalog" },
  { to: "/parent/challenges", label: "Challenges", tip: "Daily and weekly bonus missions" },
  { to: "/parent/children", label: "Kids", tip: "Add kids, edit per-child settings, view ledger" },
  { to: "/parent/members", label: "Members", tip: "Invite parents and caregivers" },
];

// Caregivers see a reduced nav — no Settings, no Members.
const caregiverLinks: NavLinkDef[] = [
  { to: "/parent", label: "Dashboard", end: true, tip: "Family overview" },
  { to: "/parent/approvals", label: "Approvals", tip: "Review pending chores and redemptions" },
  { to: "/parent/tasks", label: "Tasks", tip: "View chore templates" },
  { to: "/parent/rewards", label: "Rewards", tip: "View reward catalog" },
  { to: "/parent/children", label: "Kids", tip: "View kid profiles and ledger" },
];

const childLinks: NavLinkDef[] = [
  { to: "/me", label: "My Day", end: true, tip: "Today's chores and your balance" },
  { to: "/me/rewards", label: "Rewards", tip: "Spend credits on rewards" },
  { to: "/me/initiative", label: "Initiative", tip: "Log extra work you did on your own" },
  { to: "/me/activity", label: "Activity", tip: "Your credit history" },
];

export function AppLayout({ role }: { role: "PARENT" | "CHILD" }) {
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);
  const logout = useAuth((s) => s.logout);
  const nav = useNavigate();
  const loc = useLocation();
  const isCaregiver = user?.role === "CAREGIVER";
  const baseLinks = role === "CHILD" ? childLinks : isCaregiver ? caregiverLinks : parentLinks;
  const links =
    role === "PARENT" && !isCaregiver && user?.isAdmin
      ? [...baseLinks, { to: "/parent/admin", label: "Admin", tip: "Customer support portal — manage any family" }]
      : baseLinks;

  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<MeResponseDTO>("/auth/me"),
    staleTime: Infinity,
  });

  const dashboardPath = role === "PARENT" ? "/parent" : "/me";
  const onDashboard = loc.pathname === dashboardPath;
  const [tourActive, setTourActive] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!me.data) return;
    if (me.data.needsOnboarding && onDashboard) setTourActive(true);
  }, [me.data, onDashboard]);

  async function finishTour() {
    setTourActive(false);
    try {
      await api("/auth/onboarded", { method: "POST" });
      if (user) setUser({ ...user, onboardedAt: new Date().toISOString() });
      me.refetch();
    } catch (e) {
      console.error("[onboarded] failed", e);
    }
  }

  return (
    <div className="min-h-full flex flex-col">
      {user && <TermsGate user={user} />}
      {isCaregiver && (
        <div className="bg-amber-100 border-b border-amber-200 text-amber-900 text-sm px-4 py-1.5 text-center">
          Caregiver session
          {user?.validUntil && <> · expires {new Date(user.validUntil).toLocaleString()}</>}
        </div>
      )}
      {role === "PARENT" && !isCaregiver && user && !user.emailVerifiedAt && (
        <EmailVerifyBanner email={user.email} />
      )}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">🪙</span>
            <span className="font-semibold text-slate-800">ChoreChampz</span>
            <nav className="hidden sm:flex items-center gap-1 ml-4">
              {links.map((l) => (
                <Tooltip key={l.to} label={l.tip} side="bottom">
                  <span className="inline-flex">
                    <NavLink
                      to={l.to}
                      end={l.end}
                      id={l.id}
                      className={({ isActive }) =>
                        clsx(
                          "px-3 py-1.5 rounded-lg text-sm font-medium transition",
                          isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100",
                        )
                      }
                    >
                      {l.label}
                    </NavLink>
                  </span>
                </Tooltip>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell />
            {role === "CHILD" && <SoundToggle />}
            {user && (
              <>
                <Tooltip label="Account menu" side="bottom">
                  <button
                    ref={menuBtnRef}
                    type="button"
                    onClick={() => setMenuOpen((v) => !v)}
                    className="flex items-center gap-2 rounded-full p-0.5 hover:ring-2 hover:ring-brand-200 transition"
                  >
                    <KidAvatar name={user.name} color={user.avatarColor} config={user.avatarConfig} size={32} />
                    <span className="hidden sm:inline text-sm text-slate-700">{user.name}</span>
                    <span className="hidden sm:inline text-xs text-slate-400">▾</span>
                  </button>
                </Tooltip>
                <Popover
                  open={menuOpen}
                  onClose={() => setMenuOpen(false)}
                  anchor={menuBtnRef.current}
                  placement="bottom"
                  className="p-1 min-w-[180px]"
                >
                  <div className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        setStudioOpen(true);
                      }}
                      className="text-left px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-100"
                    >
                      Edit avatar
                    </button>
                    {role === "PARENT" && !isCaregiver && (
                      <Link
                        to="/parent/settings"
                        id="nav-settings"
                        onClick={() => setMenuOpen(false)}
                        className="px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-100"
                      >
                        Settings
                      </Link>
                    )}
                    <div className="my-1 h-px bg-slate-100" />
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        logout();
                        nav("/login");
                      }}
                      className="text-left px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-100"
                    >
                      Sign out
                    </button>
                  </div>
                </Popover>
              </>
            )}
          </div>
        </div>
        <nav className="sm:hidden border-t border-slate-100 px-2 py-1 flex gap-1 overflow-x-auto">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                clsx(
                  "shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium",
                  isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100",
                )
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
        <Outlet />
      </main>
      <LegalFooter />
      {tourActive && (
        <OnboardingTour steps={role === "PARENT" ? parentTour : childTour} onDone={finishTour} />
      )}
      {studioOpen && user && <AvatarStudio user={user} onClose={() => setStudioOpen(false)} />}
    </div>
  );
}
