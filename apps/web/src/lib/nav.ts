// Single source of truth for primary navigation: link definitions, the curated
// set of bottom-tab routes on native, and screen-title resolution for the native
// contextual header. Shared by AppLayout (renders nav) and the More page (renders
// the overflow). Keeping it here avoids the two drifting apart.

export interface NavLinkDef {
  to: string;
  label: string;
  end?: boolean;
  id?: string;
  tip?: string;
}

export const parentLinks: NavLinkDef[] = [
  { to: "/parent", label: "Dashboard", end: true, tip: "Family overview, balances, recent activity" },
  { to: "/parent/approvals", label: "Approvals", tip: "Review pending chores and redemptions" },
  { to: "/parent/tasks", label: "Tasks", id: "nav-tasks", tip: "Create and manage chore templates" },
  { to: "/parent/rewards", label: "Rewards", id: "nav-rewards", tip: "Manage the reward catalog" },
  { to: "/parent/challenges", label: "Challenges", tip: "Daily and weekly bonus missions" },
  { to: "/parent/children", label: "Kids", tip: "Add kids, edit per-child settings, view ledger" },
  { to: "/parent/members", label: "Members", tip: "Invite parents and caregivers" },
];

// Caregivers see a reduced nav — no Settings, no Members.
export const caregiverLinks: NavLinkDef[] = [
  { to: "/parent", label: "Dashboard", end: true, tip: "Family overview" },
  { to: "/parent/approvals", label: "Approvals", tip: "Review pending chores and redemptions" },
  { to: "/parent/tasks", label: "Tasks", tip: "View chore templates" },
  { to: "/parent/rewards", label: "Rewards", tip: "View reward catalog" },
  { to: "/parent/children", label: "Kids", tip: "View kid profiles and ledger" },
];

export const childLinks: NavLinkDef[] = [
  { to: "/me", label: "My Day", end: true, tip: "Today's chores and your balance" },
  { to: "/me/rewards", label: "Rewards", tip: "Spend credits on rewards" },
  { to: "/me/initiative", label: "Initiative", tip: "Log extra work you did on your own" },
  { to: "/me/activity", label: "Activity", tip: "Your credit history" },
];

// The four routes that earn a bottom-tab slot on native. Everything else moves
// into the More tab. Curated by priority, NOT array-truncated — a slice would
// silently drop Kids/Members off the parent bar. A synthetic "More" tab is
// appended to these at render time.
export const PARENT_PRIMARY_ROUTES = ["/parent", "/parent/approvals", "/parent/tasks", "/parent/children"];
export const CHILD_PRIMARY_ROUTES = ["/me", "/me/rewards", "/me/initiative", "/me/activity"];

// The More tab itself — a real route (apps/web/src/pages/More.tsx) rendered
// inside AppLayout's Outlet on native.
export const MORE_TAB: NavLinkDef = {
  to: "/more",
  label: "More",
  tip: "Settings, account, and everything else",
};

// Titles for screens that aren't primary nav links (reached from More or deep
// links). The native header reads from here when no nav link matches.
const EXTRA_TITLES: Record<string, string> = {
  "/more": "More",
  "/parent/settings": "Settings",
  "/parent/ledger": "Ledger",
  "/parent/admin": "Admin",
  "/beta": "Beta",
  "/beta/checklist": "Beta",
  "/beta/feedback": "Feedback",
};

// Resolve the contextual title for the native header: exact nav-link match first,
// then the extras map, then the longest-prefix nav link (so e.g. a future
// /parent/tasks/:id still reads "Tasks"). Falls back to the brand name.
export function resolveScreenTitle(pathname: string, links: NavLinkDef[]): string {
  const exact = links.find((l) => l.to === pathname);
  if (exact) return exact.label;
  if (EXTRA_TITLES[pathname]) return EXTRA_TITLES[pathname];
  const prefix = links.filter((l) => pathname.startsWith(l.to)).sort((a, b) => b.to.length - a.to.length)[0];
  return prefix?.label ?? "ChoreChampz";
}

// Passed from AppLayout to the More page via the router Outlet context so More
// renders exactly the links that fell off the bottom bar, plus role/beta flags.
export interface AppLayoutOutletContext {
  links: NavLinkDef[];
  primaryRoutes: string[];
  role: "PARENT" | "CHILD";
  isCaregiver: boolean;
  isBeta: boolean;
}
