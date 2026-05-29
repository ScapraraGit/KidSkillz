import { isNativePlatform, secureStore } from "./secureStore";

const KEY = "chorechampz.deviceToken";
const FAMILY_KEY = "chorechampz.deviceFamilyId";
const LABEL_KEY = "chorechampz.deviceLabel";

export interface DeviceSession {
  token: string;
  familyId: string;
  label: string;
}

// The device session is a long-lived credential, so on native it lives in the
// Keychain/Keystore (via secureStore), not WebView localStorage. Callers
// (api.ts request builder, Login) read it synchronously, so an in-memory cache
// fronts the async secure store: it is seeded once at boot (initDeviceSession)
// and writes flush to the store fire-and-forget.
let cache: DeviceSession | null = null;
let loaded = false;

// Web reads localStorage synchronously, so the cache can be seeded at import
// time — no boot gate needed for web. Native must await initDeviceSession().
if (!isNativePlatform) {
  try {
    const token = localStorage.getItem(KEY);
    cache = token
      ? {
          token,
          familyId: localStorage.getItem(FAMILY_KEY) ?? "",
          label: localStorage.getItem(LABEL_KEY) ?? "",
        }
      : null;
  } catch {
    cache = null;
  }
  loaded = true;
}

export async function initDeviceSession(): Promise<void> {
  if (loaded) return;
  const token = await secureStore.get(KEY);
  cache = token
    ? {
        token,
        familyId: (await secureStore.get(FAMILY_KEY)) ?? "",
        label: (await secureStore.get(LABEL_KEY)) ?? "",
      }
    : null;
  loaded = true;
}

export function getDeviceToken(): string | null {
  return cache?.token ?? null;
}

export function getDeviceSession(): DeviceSession | null {
  return cache;
}

export function setDeviceSession(s: DeviceSession): void {
  cache = s;
  void secureStore.set(KEY, s.token);
  void secureStore.set(FAMILY_KEY, s.familyId);
  void secureStore.set(LABEL_KEY, s.label);
}

export function clearDeviceSession(): void {
  cache = null;
  void secureStore.remove(KEY);
  void secureStore.remove(FAMILY_KEY);
  void secureStore.remove(LABEL_KEY);
}
