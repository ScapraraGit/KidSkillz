import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Tooltip } from "./Tooltip";
import type { ChildDTO, ChildViewMode } from "@chorechampz/shared";

export function KidPrefsToolbar() {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ["children", "me"],
    queryFn: () => api<{ children: ChildDTO[] }>("/children"),
    select: (raw): ChildDTO | null => raw?.children?.[0] ?? null,
    staleTime: 30_000,
  });

  const patch = useMutation({
    mutationFn: (body: { soundEnabled?: boolean; viewMode?: ChildViewMode }) =>
      api<{ child: ChildDTO }>("/children/preferences", { method: "PATCH", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["children", "me"] });
      qc.invalidateQueries({ queryKey: ["children"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const soundEnabled = me.data?.soundEnabled ?? false;
  const viewMode = me.data?.viewMode ?? "YOUNGER";
  const isYounger = viewMode === "YOUNGER";

  const soundLabel = soundEnabled ? "Sounds on — click to mute" : "Sounds off — click to enable";
  const viewLabel = isYounger
    ? "Younger view (pet) — switch to older"
    : "Older view (stats) — switch to younger";

  const disabled = !me.data || patch.isPending;

  return (
    <div className="flex items-center gap-1">
      <Tooltip label={viewLabel} side="bottom">
        <button
          type="button"
          onClick={() => patch.mutate({ viewMode: isYounger ? "OLDER" : "YOUNGER" })}
          disabled={disabled}
          aria-label={viewLabel}
          aria-pressed={!isYounger ? "true" : "false"}
          className="text-lg leading-none rounded-full px-2 py-1 hover:bg-slate-100 transition disabled:opacity-50"
        >
          {isYounger ? "🧒" : "🧑"}
        </button>
      </Tooltip>
      <Tooltip label={soundLabel} side="bottom">
        <button
          type="button"
          onClick={() => patch.mutate({ soundEnabled: !soundEnabled })}
          disabled={disabled}
          aria-label={soundLabel}
          aria-pressed={soundEnabled ? "true" : "false"}
          className="text-xl leading-none rounded-full px-2 py-1 hover:bg-slate-100 transition disabled:opacity-50"
        >
          {soundEnabled ? "🔊" : "🔇"}
        </button>
      </Tooltip>
    </div>
  );
}

// Backwards-compatible alias for the prior single-button name.
export const SoundToggle = KidPrefsToolbar;
