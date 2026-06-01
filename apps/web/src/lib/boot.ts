import { isNativePlatform } from "./secureStore";
import { initDeviceSession } from "./deviceToken";
import { useAuth } from "../store/auth";

// On native, persisted auth + device session load asynchronously from the
// Keychain/Keystore. Render must wait for that or the app flashes logged-out and
// the request builder fires without a token. Web persistence is synchronous, so
// this is a no-op there.
async function awaitAuthHydration(): Promise<void> {
  if (useAuth.persist.hasHydrated()) return;
  await new Promise<void>((resolve) => {
    const unsub = useAuth.persist.onFinishHydration(() => {
      unsub();
      resolve();
    });
  });
}

export async function awaitBoot(): Promise<void> {
  if (!isNativePlatform) return;
  await Promise.all([awaitAuthHydration(), initDeviceSession()]);
}

// Configure native UI chrome after first render. Called once from App.tsx on
// mount. Does not block render — status bar style flicker is imperceptible
// compared to the auth hydration delay handled by awaitBoot().
//
// StatusBar: dark icons on a white background to match NativeHeader. Android
// also gets an explicit white background colour so the gap under the status bar
// (between the notch and the WebView) doesn't show the system default colour.
// iOS status bar is always overlay-on-WebView, so pt-safe already handles it;
// only the icon style matters there.
export async function initNativeUI(): Promise<void> {
  if (!isNativePlatform) return;
  try {
    const [{ StatusBar, Style }, { Capacitor }] = await Promise.all([
      import("@capacitor/status-bar"),
      import("@capacitor/core"),
    ]);
    await StatusBar.setStyle({ style: Style.Dark });
    if (Capacitor.getPlatform() === "android") {
      await StatusBar.setBackgroundColor({ color: "#ffffff" });
    }
  } catch {
    // Plugin unavailable (e.g. web build or missing native dependency) — safe to ignore.
  }
}
