import type { ReactNode } from "react";

// Hand-rolled monochrome line icons for the native tab bar and the More list.
// Inline SVG keeps the project's zero-icon-dep stance (see the old emoji map it
// replaces). Crucially these stroke `currentColor`, so a parent's active-tab
// `text-brand-700` actually tints the icon — emoji ignored color, which made the
// active tab indistinguishable from the inactive ones. Active state thickens the
// stroke and adds a faint fill so the selected tab reads at a glance.

interface IconProps {
  active?: boolean;
  size?: number;
}

function Svg({ children, active, size = 24 }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={active ? "currentColor" : "none"}
      fillOpacity={active ? 0.12 : 0}
      stroke="currentColor"
      strokeWidth={active ? 2.2 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const Home = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
  </Svg>
);

const Check = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12.5 2.5 2.5 4.5-5" />
  </Svg>
);

const List = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 6h12M8 12h12M8 18h12" />
    <path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" strokeWidth={p.active ? 3 : 2.4} />
  </Svg>
);

const Gift = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="8" width="17" height="4.5" rx="1" />
    <path d="M5 12.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7.5" />
    <path d="M12 8v13" />
    <path d="M12 8S10.7 3.5 8.3 3.5a2.2 2.2 0 0 0 0 4.5H12Z" />
    <path d="M12 8s1.3-4.5 3.7-4.5a2.2 2.2 0 0 1 0 4.5H12Z" />
  </Svg>
);

const Trophy = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7.5 4h9v4.5a4.5 4.5 0 0 1-9 0Z" />
    <path d="M7.5 5.5h-2a2 2 0 0 0 0 4h1.2" />
    <path d="M16.5 5.5h2a2 2 0 0 1 0 4h-1.2" />
    <path d="M12 13v3" />
    <path d="M9 20h6l-.6-4h-4.8Z" />
  </Svg>
);

const Users = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
    <path d="M16 5.2a3 3 0 0 1 0 5.6" />
    <path d="M17 14.2a5.5 5.5 0 0 1 3.5 5.8" />
  </Svg>
);

const Star = (p: IconProps) => (
  <Svg {...p}>
    <path d="m12 3.5 2.6 5.2 5.8.9-4.2 4.1 1 5.8L12 16.8 6 19.5l1-5.8-4.2-4.1 5.8-.9Z" />
  </Svg>
);

const Chart = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 4v16h16" />
    <path d="M8 16v-4M12 16V8M16 16v-6" strokeWidth={p.active ? 3 : 2.2} />
  </Svg>
);

const Grid = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="4" width="6.5" height="6.5" rx="1.6" />
    <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6" />
    <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6" />
  </Svg>
);

const Settings = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1" />
  </Svg>
);

// Route → icon. Members reuses Users (label disambiguates). Routes without an
// entry fall back to a neutral dot so nothing crashes.
const ICONS: Record<string, (p: IconProps) => ReactNode> = {
  "/parent": Home,
  "/parent/approvals": Check,
  "/parent/tasks": List,
  "/parent/rewards": Gift,
  "/parent/challenges": Trophy,
  "/parent/children": Users,
  "/parent/members": Users,
  "/parent/settings": Settings,
  "/me": Home,
  "/me/rewards": Gift,
  "/me/initiative": Star,
  "/me/activity": Chart,
  "/more": Grid,
};

const Dot = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="2.5" fill="currentColor" />
  </Svg>
);

export function NavIcon({ to, active, size }: { to: string; active?: boolean; size?: number }) {
  const Icon = ICONS[to] ?? Dot;
  return <>{Icon({ active, size })}</>;
}
