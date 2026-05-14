import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthUserDTO, FamilySettings } from "@chorechampz/shared";

interface AuthState {
  token: string | null;
  user: AuthUserDTO | null;
  settings: FamilySettings | null;
  setSession: (token: string, user: AuthUserDTO) => void;
  setSettings: (s: FamilySettings) => void;
  setUser: (u: AuthUserDTO) => void;
  logout: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      settings: null,
      setSession: (token, user) => set({ token, user }),
      setSettings: (settings) => set({ settings }),
      setUser: (user) => set({ user }),
      logout: () => set({ token: null, user: null, settings: null }),
    }),
    { name: "chorechampz-auth" },
  ),
);
