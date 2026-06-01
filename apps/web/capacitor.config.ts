import type { CapacitorConfig } from "@capacitor/cli";

// Wraps the existing apps/web Vite build in a native shell (Phase 1 of
// plans/mobile-capacitor.md). webDir points at Vite's default `dist`; run
// `pnpm build` before `cap sync` so the native projects pick up fresh assets.
//
// The shell talks to the API via VITE_API_URL baked into the build — Capacitor
// does not proxy or rewrite requests.
//
// CAP_ENV gates the WebView origin scheme, read at `cap sync` time:
//   prod (default) → androidScheme=https → origin https://localhost. Secure
//     context for camera/push; pairs with an HTTPS API. No cleartext allowed.
//   dev (CAP_ENV=dev) → androidScheme=http → origin http://localhost so an
//     emulator can reach a local http API at http://10.0.2.2:4000 without
//     tripping WebView mixed-content blocking. Cleartext to 10.0.2.2 is granted
//     ONLY in the Android debug build via the src/debug network-security-config
//     overlay — release builds never permit cleartext.
const isDev = process.env.CAP_ENV === "dev";

const config: CapacitorConfig = {
  appId: "com.chorechampz.app",
  appName: "ChoreChampz",
  webDir: "dist",
  server: {
    androidScheme: isDev ? "http" : "https",
  },
  plugins: {
    // Resize the document body (not just the viewport) when the software
    // keyboard appears. This pushes fixed-bottom elements — including the
    // bottom-sheet Modal and the bottom tab bar — up above the keyboard
    // instead of getting hidden beneath it.
    Keyboard: {
      resize: "body",
      resizeOnFullScreen: true,
    },
    // Auto-hide splash on app start; initNativeUI() in boot.ts manages the
    // status bar style so the white header and dark icons match on every screen.
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 500,
    },
  },
};

export default config;
