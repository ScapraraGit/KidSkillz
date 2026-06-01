import { Capacitor } from "@capacitor/core";

export const isNative = (): boolean => Capacitor.isNativePlatform();

type HapticStyle = "light" | "medium" | "heavy" | "success" | "warning" | "error";

// Haptics are best-effort: a missing plugin, a web build, or an emulator without
// a vibrator should never throw into the calling action handler.
export async function haptic(style: HapticStyle = "light"): Promise<void> {
  if (!isNative()) return;
  try {
    const mod = await import("@capacitor/haptics");
    const { Haptics, ImpactStyle, NotificationType } = mod;
    if (style === "success") await Haptics.notification({ type: NotificationType.Success });
    else if (style === "warning") await Haptics.notification({ type: NotificationType.Warning });
    else if (style === "error") await Haptics.notification({ type: NotificationType.Error });
    else if (style === "heavy") await Haptics.impact({ style: ImpactStyle.Heavy });
    else if (style === "medium") await Haptics.impact({ style: ImpactStyle.Medium });
    else await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    /* haptics unavailable — ignore */
  }
}
