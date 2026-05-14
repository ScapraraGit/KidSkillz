import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../lib/api";
import {
  Badge,
  Button,
  Card,
  CreditChip,
  EmptyState,
  Field,
  PageHeader,
  inputCls,
} from "../../components/ui";
import { Tooltip } from "../../components/Tooltip";
import { useAuth } from "../../store/auth";
import type { InitiativeRequestDTO } from "@chorechampz/shared";

export function ChildInitiative() {
  const settings = useAuth((s) => s.settings);
  const qc = useQueryClient();
  const myInitQ = useQuery({
    queryKey: ["initiative", "mine"],
    queryFn: () => api<{ initiative: InitiativeRequestDTO[] }>("/initiative"),
  });

  const [kind, setKind] = useState<"PLANNED" | "WRITE_IN">("PLANNED");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [credits, setCredits] = useState(5);
  const [success, setSuccess] = useState(false);

  const submit = useMutation({
    mutationFn: () =>
      api("/initiative", {
        body: { kind, title, description: description || undefined, suggestedCredits: credits },
      }),
    onSuccess: () => {
      setSuccess(true);
      setTitle("");
      setDescription("");
      setCredits(5);
      qc.invalidateQueries({ queryKey: ["initiative"] });
      setTimeout(() => setSuccess(false), 2500);
    },
  });

  const bonus = settings?.initiativeBonus;
  return (
    <div className="space-y-6">
      <PageHeader title="Initiative" subtitle="Step up. Plan ahead. Earn extra." />

      <Card>
        <div className="flex gap-1 p-1 bg-slate-100 rounded-xl mb-4">
          <Tooltip label="Tell us before you start — eligible for bonus credits when approved">
            <Button
              variant={kind === "PLANNED" ? "primary" : "ghost"}
              className="flex-1"
              onClick={() => setKind("PLANNED")}
            >
              📅 Plan ahead
            </Button>
          </Tooltip>
          <Tooltip label="Log work you already finished. No bonus, but still earns credit.">
            <Button
              variant={kind === "WRITE_IN" ? "primary" : "ghost"}
              className="flex-1"
              onClick={() => setKind("WRITE_IN")}
            >
              ✍️ Already did it
            </Button>
          </Tooltip>
        </div>

        {kind === "PLANNED" && bonus?.enabled && (
          <div className="rounded-xl bg-brand-50 border border-brand-200 p-3 mb-4 text-sm text-brand-900">
            <strong>Bonus available:</strong> Planning ahead can earn you extra credits when approved (+
            {bonus.plannedFlatBonus} flat
            {bonus.plannedMultiplier > 1 ? ` and ×${bonus.plannedMultiplier}` : ""}).
          </div>
        )}
        {kind === "WRITE_IN" && (
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 mb-4 text-sm text-slate-700">
            Tell us what you already did and how many credits it's worth. A grown-up will review.
          </div>
        )}

        <div className="space-y-3">
          <Field label="What is it?">
            <input
              className={inputCls}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Organize the bookshelf"
            />
          </Field>
          <Field label="Tell us more">
            <textarea
              className={inputCls}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <Field label="Suggested credits">
            <input
              className={`${inputCls} w-32`}
              type="number"
              min={0}
              value={credits}
              onChange={(e) => setCredits(Number(e.target.value))}
            />
          </Field>
        </div>

        <div className="mt-4 flex justify-end">
          <Tooltip label="Send to a parent to review. Credits post when approved.">
            <Button onClick={() => submit.mutate()} disabled={submit.isPending || !title}>
              {submit.isPending ? "Sending…" : "Submit for approval"}
            </Button>
          </Tooltip>
        </div>
        {success && <div className="text-sm text-emerald-700 mt-2">Submitted! 🎉</div>}
      </Card>

      <Card>
        <h3 className="font-semibold mb-3">Your initiative history</h3>
        {myInitQ.data?.initiative.length === 0 ? (
          <EmptyState title="Submit your first one above!" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {myInitQ.data?.initiative.map((i) => (
              <li key={i.id} className="py-3 flex flex-wrap items-center gap-3">
                <Badge color={i.kind === "PLANNED" ? "brand" : "slate"}>
                  {i.kind === "PLANNED" ? "📅 Planned" : "✍️ Write-in"}
                </Badge>
                <div className="flex-1 min-w-[120px]">
                  <div className="text-sm font-medium">{i.title}</div>
                  {i.description && <div className="text-xs text-slate-500">{i.description}</div>}
                </div>
                <CreditChip amount={i.creditAwarded ?? i.suggestedCredits} />
                {i.bonusApplied && i.bonusApplied > 0 && <Badge color="amber">+{i.bonusApplied} bonus</Badge>}
                <Badge
                  color={i.status === "APPROVED" ? "emerald" : i.status === "REJECTED" ? "rose" : "amber"}
                >
                  {i.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
