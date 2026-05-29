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
