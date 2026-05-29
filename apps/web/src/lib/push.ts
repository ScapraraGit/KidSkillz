import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { api } from "./api";
import { isNativePlatform } from "./secureStore";
import { useAuth } from "../store/auth";

// Phase 3 (mobile half) of plans/mobile-capacitor.md. Registers the device's FCM
// token with the API after login and prunes it on logout, so createNotification's
// deliverPushMirror has a token to fan out to. Native-only — no-ops on web.

let currentToken: string | null = null;
let navigateHandler: ((path: string) => void) | null = null;

// App wires this to react-router's navigate so a tapped notification can deep-link.
export function setPushNavigateHandler(fn: (path: string) => void): void {
  navigateHandler = fn;
}

function platform(): "IOS" | "ANDROID" | null {
  const p = Capacitor.getPlatform();
  if (p === "ios") return "IOS";
  if (p === "android") return "ANDROID";
  return null;
}

// Notifications are addressed to a specific user, so the recipient's role plus the
// notification kind is enough to land on a sensible screen. Full payload-driven
// routing (specific completion/redemption) lands with deep links in Phase 4.
function resolvePath(kind: string | undefined): string | null {
  const role = useAuth.getState().user?.role;
  if (!role) return null;
  if (role === "CHILD") {
    return kind?.startsWith("REDEMPTION") ? "/me/rewards" : "/me/activity";
  }
  if (kind?.startsWith("INITIATIVE")) return "/parent/approvals";
  return "/parent";
}

export async function registerPushForSession(): Promise<void> {
  if (!isNativePlatform) return;
  const plat = platform();
  if (!plat) return;

  // Idempotent: clear stale listeners before re-wiring (login after logout, token rotation).
  await PushNotifications.removeAllListeners();

  await PushNotifications.addListener("registration", async (t) => {
    currentToken = t.value;
    try {
      await api("/notifications/push-tokens", {
        method: "POST",
        body: { token: t.value, platform: plat },
      });
    } catch (e) {
      console.error("[push] token registration failed", e);
    }
  });

  await PushNotifications.addListener("registrationError", (e) => {
    console.error("[push] registration error", e);
  });

  await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const data = action.notification.data as Record<string, string> | undefined;
    const path = resolvePath(data?.kind);
    if (path && navigateHandler) navigateHandler(path);
  });

  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
    perm = await PushNotifications.requestPermissions();
  }
  if (perm.receive !== "granted") return;
  await PushNotifications.register();
}

export async function teardownPushForSession(): Promise<void> {
  if (!isNativePlatform) return;
  const token = currentToken;
  currentToken = null;
  await PushNotifications.removeAllListeners();
  if (!token) return;
  try {
    await api("/notifications/push-tokens", { method: "DELETE", body: { token } });
  } catch (e) {
    console.error("[push] token clear failed", e);
  }
}
