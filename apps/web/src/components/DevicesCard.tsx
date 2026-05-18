import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { Button, Card, Field, inputCls } from "./ui";
import { Modal } from "./Modal";
import { Tooltip } from "./Tooltip";
import { QrCode } from "./QrCode";

interface DeviceRow {
  id: string;
  label: string;
  enrolledAt: string | null;
  lastSeenAt: string | null;
  revoked: boolean;
  createdAt: string;
}

interface EnrollResponse {
  enrollmentId: string;
  pairingCode: string;
  pairingCodeDisplay: string;
  qrUrl: string;
  expiresAt: string;
}

function fmtWhen(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleString();
}

export function DevicesCard() {
  const qc = useQueryClient();
  const listQ = useQuery({
    queryKey: ["devices"],
    queryFn: () => api<{ devices: DeviceRow[] }>("/family/devices"),
  });

  const [showEnroll, setShowEnroll] = useState(false);
  const [label, setLabel] = useState("");
  const [enrollResp, setEnrollResp] = useState<EnrollResponse | null>(null);

  const enroll = useMutation({
    mutationFn: () =>
      api<EnrollResponse>("/family/devices/enroll", {
        method: "POST",
        body: { label: label.trim() || undefined },
      }),
    onSuccess: (r) => {
      setEnrollResp(r);
      qc.invalidateQueries({ queryKey: ["devices"] });
    },
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api(`/family/devices/${id}/revoke`, { method: "POST", body: {} }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["devices"] }),
  });

  const rename = useMutation({
    mutationFn: ({ id, label }: { id: string; label: string }) =>
      api(`/family/devices/${id}/rename`, { method: "POST", body: { label } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["devices"] }),
  });

  const closeModal = () => {
    setShowEnroll(false);
    setLabel("");
    setEnrollResp(null);
  };

  const devices = listQ.data?.devices ?? [];
  const activeCount = devices.filter((d) => !d.revoked).length;

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Paired devices</h3>
        <Tooltip label="Pair a tablet, phone, or laptop kids will use to sign in">
          <Button type="button" variant="secondary" onClick={() => setShowEnroll(true)}>
            Pair new device
          </Button>
        </Tooltip>
      </div>
      <p className="text-xs text-slate-500">
        {activeCount === 0
          ? "No devices paired yet. Pair one for shared-device kid login."
          : `${activeCount} active device${activeCount === 1 ? "" : "s"}`}
      </p>

      <div className="space-y-2">
        {devices.map((d) => (
          <div
            key={d.id}
            className={`flex items-center justify-between p-3 rounded-xl border ${
              d.revoked ? "border-slate-200 bg-slate-50 opacity-60" : "border-slate-200"
            }`}
          >
            <div className="min-w-0">
              <div className="font-medium truncate">{d.label}</div>
              <div className="text-xs text-slate-500">
                {d.revoked ? "Revoked" : `Last seen ${fmtWhen(d.lastSeenAt)}`}
              </div>
            </div>
            {!d.revoked && (
              <div className="flex gap-2">
                <Tooltip label="Change the friendly label shown here">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      const next = prompt("New label", d.label);
                      if (next && next.trim() && next !== d.label) {
                        rename.mutate({ id: d.id, label: next.trim() });
                      }
                    }}
                  >
                    Rename
                  </Button>
                </Tooltip>
                <Tooltip label="Sign this device out. It must re-pair to sign back in.">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      if (confirm(`Revoke "${d.label}"? Anyone using it will be signed out.`)) {
                        revoke.mutate(d.id);
                      }
                    }}
                  >
                    Revoke
                  </Button>
                </Tooltip>
              </div>
            )}
          </div>
        ))}
      </div>

      {showEnroll && (
        <Modal open={showEnroll} title="Pair a new device" onClose={closeModal}>
          {!enrollResp ? (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                enroll.mutate();
              }}
            >
              <Field label="Device label" hint="e.g. Kitchen iPad, Ava's Kindle">
                <input
                  className={inputCls}
                  placeholder="Kitchen iPad"
                  maxLength={80}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </Field>
              {enroll.error && (
                <div className="text-sm text-rose-600">{(enroll.error as Error).message ?? "Failed"}</div>
              )}
              <Button type="submit" className="w-full" disabled={enroll.isPending}>
                {enroll.isPending ? "Generating…" : "Generate pairing code"}
              </Button>
            </form>
          ) : (
            <div className="space-y-3 text-center">
              <p className="text-sm text-slate-600">
                On the new device, scan the QR or open <strong>/pair</strong> and enter:
              </p>
              <div className="text-3xl font-mono tracking-widest font-semibold">
                {enrollResp.pairingCodeDisplay}
              </div>
              <div className="flex justify-center">
                <QrCode value={enrollResp.qrUrl} size={220} />
              </div>
              <p className="text-xs text-slate-500">
                Expires {new Date(enrollResp.expiresAt).toLocaleTimeString()}. Single use.
              </p>
              <Button type="button" className="w-full" onClick={closeModal}>
                Done
              </Button>
            </div>
          )}
        </Modal>
      )}
    </Card>
  );
}
