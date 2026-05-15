import { useQuery } from "@tanstack/react-query";
import type { FeatureFlagsDTO, MeResponseDTO } from "@chorechampz/shared";
import { api } from "../lib/api";

const DEFAULTS: FeatureFlagsDTO = {
  photoProof: false,
  devicePairing: false,
};

// Reads feature flags off the cached /auth/me response. AppLayout primes the
// ["me"] query at mount, so this hook is a cheap selector everywhere else. Falls
// back to "everything off" if /auth/me hasn't resolved yet — better to hide a
// disabled option for a frame than to render an option the API will reject.
export function useFeatures(): FeatureFlagsDTO {
  const q = useQuery({
    queryKey: ["me"],
    queryFn: () => api<MeResponseDTO>("/auth/me"),
    staleTime: Infinity,
  });
  return q.data?.features ?? DEFAULTS;
}
