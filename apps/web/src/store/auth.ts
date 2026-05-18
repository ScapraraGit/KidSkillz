import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthUserDTO, FamilySettings } from "@chorechampz/shared";

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: AuthUserDTO | null;
  settings: FamilySettings | null;
  setSession: (token: string, user: AuthUserDTO, refreshToken?: string | null) => void;
  setAccessToken: (token: string, refreshToken?: string | null) => void;
  setSettings: (s: FamilySettings) => void;
  setUser: (u: AuthUserDTO) => void;
  logout: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      refreshToken: null,
      user: null,
      settings: null,
      setSession: (token, user, refreshToken) =>
        set((s) => ({ token, user, refreshToken: refreshToken ?? s.refreshToken })),
      setAccessToken: (token, refreshToken) =>
        set((s) => ({ token, refreshToken: refreshToken ?? s.refreshToken })),
      setSettings: (settings) => set({ settings }),
      setUser: (user) => set({ user }),
      logout: () => set({ token: null, refreshToken: null, user: null, settings: null }),
    }),
    { name: "chorechampz-auth" },
  ),
);
