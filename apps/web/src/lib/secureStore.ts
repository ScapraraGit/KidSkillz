import { Capacitor } from "@capacitor/core";
import { SecureStorage } from "@aparajita/capacitor-secure-storage";
import type { StateStorage } from "zustand/middleware";

// Phase 2 of plans/mobile-capacitor.md — stop persisting JWTs / device tokens in
// WebView localStorage on device. Native builds route persistence through the
// iOS Keychain / Android Keystore (hardware-encrypted at rest, not reachable
// from JS/XSS); the web build keeps localStorage so browser behavior is
// unchanged. Mirrors the codebase's "swap one class" provider pattern.
export const isNativePlatform = Capacitor.isNativePlatform();

export interface AsyncKV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

const nativeKV: AsyncKV = {
  async get(key) {
    const v = await SecureStorage.get(key);
    return typeof v === "string" ? v : null;
  },
  async set(key, value) {
    await SecureStorage.set(key, value);
  },
  async remove(key) {
    await SecureStorage.remove(key);
  },
};

const webKV: AsyncKV = {
  async get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  async set(key, value) {
    localStorage.setItem(key, value);
  },
  async remove(key) {
    localStorage.removeItem(key);
  },
};

export const secureStore: AsyncKV = isNativePlatform ? nativeKV : webKV;

// Zustand `persist` storage. Web returns the synchronous localStorage directly
// (no hydration gap, no regression). Native wraps the async Keychain/Keystore KV;
// persist hydrates asynchronously, so render is gated until hydration finishes
// (see lib/boot.ts).
export const authPersistStorage: StateStorage = isNativePlatform
  ? {
      getItem: (name) => nativeKV.get(name),
      setItem: (name, value) => nativeKV.set(name, value),
      removeItem: (name) => nativeKV.remove(name),
    }
  : localStorage;
