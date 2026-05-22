import { useNavigate } from "react-router-dom";
import { Button, Card, PageHeader } from "../../components/ui";
import { Tooltip } from "../../components/Tooltip";

export function BetaWelcome() {
  const nav = useNavigate();
  return (
    <div>
      <PageHeader
        title="Welcome to the ChoreChampz beta"
        subtitle="Thanks for helping us figure out what works (and what doesn't)."
      />
      <Card>
        <p className="text-sm text-slate-700">
          You're one of a small group testing ChoreChampz before we open it up. Your honest take is worth more
          to us than any spec — the goal here is to find what's confusing, what's missing, and whether this is
          something your kid would actually want to use.
        </p>
        <p className="text-sm text-slate-700 mt-2">
          Plan on about <strong>10–15 minutes</strong>. There are two steps:
        </p>
        <ol className="list-decimal pl-5 mt-2 text-sm text-slate-700 space-y-1">
          <li>
            <strong>Run through the checklist</strong> — try the main flows (chores, approvals, rewards).
            Toggles save as you go.
          </li>
          <li>
            <strong>Share feedback</strong> — quick ratings + a few open questions. Skip anything you don't
            have an opinion on.
          </li>
        </ol>
        <div className="mt-5 flex flex-col sm:flex-row gap-2">
          <Tooltip label="Walk through the suggested testing flow">
            <span className="inline-flex">
              <Button size="lg" onClick={() => nav("/beta/checklist")}>
                Start the checklist
              </Button>
            </span>
          </Tooltip>
          <Tooltip label="Jump straight to the feedback form">
            <span className="inline-flex">
              <Button variant="secondary" size="lg" onClick={() => nav("/beta/feedback")}>
                Skip to feedback
              </Button>
            </span>
          </Tooltip>
        </div>
      </Card>
    </div>
  );
}
