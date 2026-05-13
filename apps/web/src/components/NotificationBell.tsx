import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { Tooltip } from "./Tooltip";
import type { NotificationDTO } from "@chorechamps/shared";

interface ListResponse {
  notifications: NotificationDTO[];
  unread: number;
}

export function NotificationBell() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const q = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<ListResponse>("/notifications?limit=20"),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const readAll = useMutation({
    mutationFn: () => api("/notifications/read-all", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const readOne = useMutation({
    mutationFn: (id: string) => api("/notifications/read", { body: { ids: [id] } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const unread = q.data?.unread ?? 0;
  const items = q.data?.notifications ?? [];

  return (
    <div className="relative" ref={wrapRef}>
      <Tooltip
        label={unread > 0 ? `${unread} unread notification${unread === 1 ? "" : "s"}` : "Notifications"}
        side="bottom"
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="relative text-xl leading-none rounded-full px-2 py-1 hover:bg-slate-100 transition"
          aria-label="Open notifications"
        >
          🔔
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-rose-600 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </Tooltip>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-white rounded-2xl shadow-xl border border-slate-200 z-50">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
            <span className="font-semibold text-sm">Notifications</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => readAll.mutate()}
                disabled={readAll.isPending}
                className="text-xs text-brand-700 hover:underline disabled:opacity-50"
              >
                Mark all read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">No notifications yet.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.map((n) => {
                const unreadItem = !n.readAt;
                return (
                  <li
                    key={n.id}
                    className={
                      "px-3 py-2 text-sm cursor-pointer " +
                      (unreadItem ? "bg-brand-50/40 hover:bg-brand-50" : "hover:bg-slate-50")
                    }
                    onClick={() => unreadItem && readOne.mutate(n.id)}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-base">{glyphFor(n.kind)}</span>
                      <div className="flex-1 min-w-0">
                        <div className={"truncate " + (unreadItem ? "font-semibold" : "")}>{n.title}</div>
                        {n.body && <div className="text-xs text-slate-600 line-clamp-2">{n.body}</div>}
                        <div className="text-[10px] text-slate-400 mt-0.5">{relTime(n.createdAt)}</div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function glyphFor(kind: NotificationDTO["kind"]): string {
  switch (kind) {
    case "COMPLETION_APPROVED":
      return "✅";
    case "COMPLETION_REJECTED":
      return "↩️";
    case "REDEMPTION_APPROVED":
      return "🎁";
    case "REDEMPTION_REJECTED":
      return "🚫";
    case "INITIATIVE_APPROVED":
      return "🌟";
    case "INITIATIVE_REJECTED":
      return "↩️";
    case "CHALLENGE_COMPLETED":
      return "🎯";
    case "LEVEL_UP":
      return "⭐";
    case "KUDOS":
      return "💬";
    default:
      return "🔔";
  }
}

function relTime(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const m = Math.floor(diffMs / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}
