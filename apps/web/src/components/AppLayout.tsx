import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../store/auth";
import { api } from "../lib/api";
import { KidAvatar } from "./KidAvatar";
import { AvatarStudio } from "./AvatarStudio";
import { OnboardingTour } from "./OnboardingTour";
import { Tooltip } from "./Tooltip";
import { childTour, parentTour } from "../lib/tours";
import clsx from "clsx";
import type { MeResponseDTO } from "@chorechamps/shared";

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
  { to: "/parent/children", label: "Kids", tip: "Add kids and edit per-child settings" },
  { to: "/parent/ledger", label: "Ledger", tip: "Full credit history (append-only)" },
  { to: "/parent/members", label: "Members", tip: "Invite parents and caregivers" },
  { to: "/parent/settings", label: "Settings", id: "nav-settings", tip: "Family-wide preferences" },
];

// Caregivers see a reduced nav — no Settings, no Members.
const caregiverLinks: NavLinkDef[] = [
  { to: "/parent", label: "Dashboard", end: true, tip: "Family overview" },
  { to: "/parent/approvals", label: "Approvals", tip: "Review pending chores and redemptions" },
  { to: "/parent/tasks", label: "Tasks", tip: "View chore templates" },
  { to: "/parent/rewards", label: "Rewards", tip: "View reward catalog" },
  { to: "/parent/children", label: "Kids", tip: "View kid profiles" },
  { to: "/parent/ledger", label: "Ledger", tip: "Credit history" },
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
  const links = role === "CHILD" ? childLinks : isCaregiver ? caregiverLinks : parentLinks;

  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<MeResponseDTO>("/auth/me"),
    staleTime: Infinity,
  });

  const dashboardPath = role === "PARENT" ? "/parent" : "/me";
  const onDashboard = loc.pathname === dashboardPath;
  const [tourActive, setTourActive] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);

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
      {isCaregiver && (
        <div className="bg-amber-100 border-b border-amber-200 text-amber-900 text-sm px-4 py-1.5 text-center">
          Caregiver session
          {user?.validUntil && <> · expires {new Date(user.validUntil).toLocaleString()}</>}
        </div>
      )}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">🪙</span>
            <span className="font-semibold text-slate-800">ChoreChamps</span>
            <nav className="hidden sm:flex items-center gap-1 ml-4">
              {links.map((l) => (
                <Tooltip key={l.to} label={l.tip} side="bottom">
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
                </Tooltip>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {user && (
              <Tooltip label="Edit your avatar" side="bottom">
                <button
                  type="button"
                  onClick={() => setStudioOpen(true)}
                  className="flex items-center gap-2 rounded-full p-0.5 hover:ring-2 hover:ring-brand-200 transition"
                >
                  <KidAvatar name={user.name} color={user.avatarColor} config={user.avatarConfig} size={32} />
                  <span className="hidden sm:inline text-sm text-slate-700">{user.name}</span>
                </button>
              </Tooltip>
            )}
            <Tooltip label="End your session" side="bottom">
              <button
                type="button"
                onClick={() => {
                  logout();
                  nav("/login");
                }}
                className="text-sm text-slate-500 hover:text-slate-800"
              >
                Sign out
              </button>
            </Tooltip>
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
      {tourActive && (
        <OnboardingTour steps={role === "PARENT" ? parentTour : childTour} onDone={finishTour} />
      )}
      {studioOpen && user && (
        <AvatarStudio user={user} onClose={() => setStudioOpen(false)} />
      )}
    </div>
  );
}
