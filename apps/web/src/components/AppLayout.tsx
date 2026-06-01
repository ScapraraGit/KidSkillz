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
import { FamilySwitcher } from "./FamilySwitcher";
import { EmailVerifyBanner } from "./EmailVerifyBanner";
import { TrialBanner } from "./TrialBanner";
import { UpgradePrompt } from "./UpgradePrompt";
import { TermsGate } from "./TermsGate";
import { HouseholdAckModal } from "./HouseholdAckModal";
import { LegalFooter } from "./LegalFooter";
import { NativeHeader } from "./NativeHeader";
import { NavIcon } from "./NavIcon";
import { childTour, parentTour } from "../lib/tours";
import {
  parentLinks,
  caregiverLinks,
  childLinks,
  PARENT_PRIMARY_ROUTES,
  CHILD_PRIMARY_ROUTES,
  MORE_TAB,
  resolveScreenTitle,
  type NavLinkDef,
  type AppLayoutOutletContext,
} from "../lib/nav";
import { isNative, haptic } from "../lib/native";
import clsx from "clsx";
import type { MeResponseDTO } from "@chorechampz/shared";

const BILLING_UI = (import.meta.env.VITE_BILLING_ENABLED as string) === "true";

export function AppLayout({ role }: { role: "PARENT" | "CHILD" }) {
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);
  const logout = useAuth((s) => s.logout);
  const nav = useNavigate();
  const loc = useLocation();
  const isCaregiver = user?.role === "CAREGIVER";
  const baseLinks = role === "CHILD" ? childLinks : isCaregiver ? caregiverLinks : parentLinks;

  // Conditional "Upgrade" CTA: only shown during an active TRIAL on the parent
  // role. Shares the cached billing query with TrialBanner so no extra fetch.
  const billingQ = useQuery({
    queryKey: ["billing", "status"],
    queryFn: () => api<{ entitlement: { source: string; isPaid: boolean } }>("/billing/status"),
    enabled: BILLING_UI && role === "PARENT" && !isCaregiver,
    staleTime: 60_000,
    retry: false,
  });
  const showUpgrade =
    BILLING_UI && role === "PARENT" && !isCaregiver && billingQ.data?.entitlement.source === "TRIAL";

  const links: NavLinkDef[] = [
    ...baseLinks,
    ...(showUpgrade
      ? [{ to: "/parent/settings#billing", label: "Upgrade", tip: "Choose a plan before your trial ends" }]
      : []),
    ...(role === "PARENT" && !isCaregiver && user?.isAdmin
      ? [{ to: "/parent/admin", label: "Admin", tip: "Customer support portal — manage any family" }]
      : []),
  ];

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

  const native = isNative();
  const primaryRoutes = role === "CHILD" ? CHILD_PRIMARY_ROUTES : PARENT_PRIMARY_ROUTES;
  // Native bottom bar: the curated primary destinations (resolved from `links`)
  // plus a synthetic More tab. NOT a slice — every primary route is intentional,
  // and overflow (Rewards, Members, …) lives on the More screen, never dropped.
  const tabDefs: NavLinkDef[] = native
    ? [
        ...primaryRoutes.map((r) => links.find((l) => l.to === r)).filter((l): l is NavLinkDef => !!l),
        MORE_TAB,
      ]
    : [];

  const screenTitle = resolveScreenTitle(loc.pathname, links);
  const outletCtx: AppLayoutOutletContext = {
    links,
    primaryRoutes,
    role,
    isCaregiver,
    isBeta: me.data?.isBeta ?? false,
  };

  // Inline status strips. On web all three stack (unchanged). On native only the
  // highest-priority one shows — caregiver > email-verify > trial — as a single
  // compact strip so at most 32px is consumed above the fold.
  const showEmailVerify = role === "PARENT" && !isCaregiver && !!user && !user.emailVerifiedAt;
  const showTrial = role === "PARENT" && !isCaregiver;
  const banners = native ? (
    <>
      {isCaregiver && (
        <div className="bg-amber-100 border-b border-amber-200 text-amber-900 text-xs px-4 py-1 text-center font-medium">
          Caregiver session
        </div>
      )}
      {!isCaregiver && showEmailVerify && <EmailVerifyBanner email={user!.email} />}
      {!isCaregiver && !showEmailVerify && showTrial && <TrialBanner />}
    </>
  ) : (
    <>
      {isCaregiver && (
        <div className="bg-amber-100 border-b border-amber-200 text-amber-900 text-sm px-4 py-1.5 text-center">
          Caregiver session
        </div>
      )}
      {showEmailVerify && <EmailVerifyBanner email={user!.email} />}
      {showTrial && <TrialBanner />}
    </>
  );

  return (
    <div className="min-h-full flex flex-col">
      {user && <TermsGate user={user} />}
      {user?.role === "PARENT" && me.data?.needsHouseholdAck && (
        <HouseholdAckModal
          open
          onAcknowledged={() => {
            me.refetch();
          }}
        />
      )}
      <UpgradePrompt />

      {native ? (
        <>
          <NativeHeader title={screenTitle} role={role} />
          {banners}
        </>
      ) : (
        <>
          {banners}
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
                          data-tour={l.id}
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
                        data-tour="account-menu"
                        onClick={() => setMenuOpen((v) => !v)}
                        className="flex items-center gap-2 rounded-full p-0.5 hover:ring-2 hover:ring-brand-200 transition"
                      >
                        <KidAvatar
                          name={user.name}
                          color={user.avatarColor}
                          config={user.avatarConfig}
                          size={32}
                        />
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
                        <FamilySwitcher onSwitched={() => setMenuOpen(false)} />
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
                            data-tour="nav-settings"
                            onClick={() => setMenuOpen(false)}
                            className="px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-100"
                          >
                            Settings
                          </Link>
                        )}
                        {role === "PARENT" && !isCaregiver && me.data?.isBeta && (
                          <Link
                            to="/beta"
                            onClick={() => setMenuOpen(false)}
                            className="px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-100"
                          >
                            Beta tester 💜
                          </Link>
                        )}
                        <div className="my-1 h-px bg-slate-100" />
                        <button
                          type="button"
                          onClick={async () => {
                            setMenuOpen(false);
                            // Best-effort: tell the server to revoke this refresh token
                            // so a stolen one can't outlive the sign-out click. Fire-and-forget.
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
            {/* Web mobile: horizontal scroll-strip below the top bar. The native
                shell uses the fixed bottom tab bar instead — this whole header is
                web-only now. */}
            <nav className="sm:hidden border-t border-slate-100 px-2 py-1 flex gap-1 overflow-x-auto">
              {links.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  end={l.end}
                  data-tour={l.id}
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
        </>
      )}

      <main
        className={clsx(
          "flex-1 max-w-6xl mx-auto w-full px-4 py-6 animate-page-in",
          // Reserve space for the fixed bottom tab bar (h-16) plus the home
          // indicator safe area so scrollable content doesn't hide under it.
          native && "pb-[calc(4rem+env(safe-area-inset-bottom))]",
        )}
        key={loc.pathname}
      >
        <Outlet context={outletCtx} />
      </main>
      {!native && <LegalFooter />}
      {native && (
        <nav
          aria-label="Primary"
          className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 pb-safe"
        >
          <ul className="flex items-stretch justify-around h-16">
            {tabDefs.map((l) => (
              <li key={l.to} className="flex-1">
                <NavLink
                  to={l.to}
                  end={l.end}
                  data-tour={l.id}
                  onClick={() => void haptic("light")}
                  className={({ isActive }) =>
                    clsx(
                      "h-full flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                      isActive ? "text-brand-700" : "text-slate-500",
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <NavIcon to={l.to} active={isActive} size={24} />
                      <span>{l.label}</span>
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
      {tourActive && (
        <OnboardingTour steps={role === "PARENT" ? parentTour : childTour} onDone={finishTour} />
      )}
      {studioOpen && user && <AvatarStudio user={user} onClose={() => setStudioOpen(false)} />}
    </div>
  );
}
