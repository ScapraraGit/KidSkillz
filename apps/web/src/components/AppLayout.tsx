import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../store/auth";
import { api } from "../lib/api";
import { KidAvatar } from "./KidAvatar";
import { AvatarStudio } from "./AvatarStudio";
import { OnboardingTour } from "./OnboardingTour";
import { childTour, parentTour } from "../lib/tours";
import clsx from "clsx";
import type { MeResponseDTO } from "@chorechamps/shared";

interface NavLinkDef {
  to: string;
  label: string;
  end?: boolean;
  id?: string;
}

const parentLinks: NavLinkDef[] = [
  { to: "/parent", label: "Dashboard", end: true },
  { to: "/parent/approvals", label: "Approvals" },
  { to: "/parent/tasks", label: "Tasks", id: "nav-tasks" },
  { to: "/parent/rewards", label: "Rewards", id: "nav-rewards" },
  { to: "/parent/children", label: "Kids" },
  { to: "/parent/ledger", label: "Ledger" },
  { to: "/parent/settings", label: "Settings", id: "nav-settings" },
];

const childLinks: NavLinkDef[] = [
  { to: "/me", label: "My Day", end: true },
  { to: "/me/rewards", label: "Rewards" },
  { to: "/me/initiative", label: "Initiative" },
  { to: "/me/activity", label: "Activity" },
];

export function AppLayout({ role }: { role: "PARENT" | "CHILD" }) {
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);
  const logout = useAuth((s) => s.logout);
  const nav = useNavigate();
  const loc = useLocation();
  const links = role === "PARENT" ? parentLinks : childLinks;

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
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">🌟</span>
            <span className="font-semibold text-slate-800">ChoreChamps</span>
            <nav className="hidden sm:flex items-center gap-1 ml-4">
              {links.map((l) => (
                <NavLink
                  key={l.to}
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
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {user && (
              <button
                type="button"
                onClick={() => setStudioOpen(true)}
                title="Edit your avatar"
                className="flex items-center gap-2 rounded-full p-0.5 hover:ring-2 hover:ring-brand-200 transition"
              >
                <KidAvatar name={user.name} color={user.avatarColor} config={user.avatarConfig} size={32} />
                <span className="hidden sm:inline text-sm text-slate-700">{user.name}</span>
              </button>
            )}
            <button
              onClick={() => {
                logout();
                nav("/login");
              }}
              className="text-sm text-slate-500 hover:text-slate-800"
            >
              Sign out
            </button>
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
