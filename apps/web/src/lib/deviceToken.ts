const KEY = "chorechampz.deviceToken";
const FAMILY_KEY = "chorechampz.deviceFamilyId";
const LABEL_KEY = "chorechampz.deviceLabel";

export interface DeviceSession {
  token: string;
  familyId: string;
  label: string;
}

export function getDeviceToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function getDeviceSession(): DeviceSession | null {
  const token = getDeviceToken();
  if (!token) return null;
  return {
    token,
    familyId: localStorage.getItem(FAMILY_KEY) ?? "",
    label: localStorage.getItem(LABEL_KEY) ?? "",
  };
}

export function setDeviceSession(s: DeviceSession): void {
  localStorage.setItem(KEY, s.token);
  localStorage.setItem(FAMILY_KEY, s.familyId);
  localStorage.setItem(LABEL_KEY, s.label);
}

export function clearDeviceSession(): void {
  localStorage.removeItem(KEY);
  localStorage.removeItem(FAMILY_KEY);
  localStorage.removeItem(LABEL_KEY);
}
