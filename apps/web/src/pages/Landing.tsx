import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui";
import { DemoCard } from "../components/DemoCard";

export function Landing() {
  const [gifOk, setGifOk] = useState(true);
  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-emerald-50">
      <header className="max-w-6xl mx-auto px-4 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🪙</span>
          <span className="font-bold text-lg text-slate-800">ChoreChamps</span>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/login">
            <Button variant="ghost" size="sm">Sign in</Button>
          </Link>
          <Link to="/signup">
            <Button size="sm">Create family</Button>
          </Link>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-4 pt-12 pb-20 grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-brand-700 bg-brand-100 rounded-full px-3 py-1">
            <span>🪙</span> Built for real families
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 mt-4 leading-tight">
            Chores done. Credits earned. Kids that <span className="text-brand-600">own it</span>.
          </h1>
          <p className="text-lg text-slate-600 mt-5">
            ChoreChamps turns the daily chore battle into a game your kids actually want to play. Assign tasks, approve completions, hand out credits, and let kids redeem rewards you control.
          </p>
          <div className="flex flex-wrap gap-3 mt-7">
            <Link to="/signup">
              <Button size="lg">Start your family — free</Button>
            </Link>
            <Link to="/login">
              <Button variant="secondary" size="lg">I already have an account</Button>
            </Link>
          </div>
          <p className="text-xs text-slate-500 mt-3">No credit card. Set up in under 2 minutes.</p>
        </div>

        <div className="relative">
          {gifOk ? (
            <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
              <img
                src="/demo.gif"
                alt="ChoreChamps in action — parent dashboard, tasks, approvals, and kid view"
                className="w-full h-auto block"
                loading="eager"
                onError={() => setGifOk(false)}
              />
            </div>
          ) : (
            <DemoCard />
          )}
        </div>
      </section>

      <section className="bg-white border-y border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-16">
          <h2 className="text-3xl font-bold text-center text-slate-900">Why parents love it</h2>
          <p className="text-center text-slate-600 mt-2 max-w-2xl mx-auto">
            Stop being the nag. Start being the cheerleader. ChoreChamps gives kids agency and gives you back your weekend.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-10">
            {[
              {
                icon: "📋",
                title: "Assign chores in seconds",
                body: "One-time, daily, or weekly. Set credit values, due times, and require proof when it matters.",
              },
              {
                icon: "📸",
                title: "Photo & note proof",
                body: "Kids submit a quick photo or note. You approve or send back — no more 'I did it!' debates.",
              },
              {
                icon: "🪙",
                title: "Credits, not bribes",
                body: "Kids earn credits for finished work and redeem them for screen time, treats, or real cash.",
              },
              {
                icon: "💡",
                title: "Initiative rewards",
                body: "Kids propose chores you didn't think of. You approve a credit value. They build the habit.",
              },
              {
                icon: "👨‍👩‍👧‍👦",
                title: "Multi-parent, multi-kid",
                body: "Both parents stay in sync. Each kid gets their own PIN and dashboard tuned to their age.",
              },
              {
                icon: "📊",
                title: "Full credit ledger",
                body: "Every credit earned, spent, or adjusted is tracked. Disputes settle themselves.",
              },
            ].map((f) => (
              <div key={f.title} className="p-6 rounded-2xl border border-slate-200 bg-slate-50/50">
                <div className="text-3xl">{f.icon}</div>
                <div className="font-semibold text-slate-900 mt-3">{f.title}</div>
                <div className="text-sm text-slate-600 mt-1">{f.body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-4 py-20 text-center">
        <h2 className="text-3xl font-bold text-slate-900">Ready to flip the chore script?</h2>
        <p className="text-slate-600 mt-3">
          Create your family in under two minutes. Add your kids, drop in a few chores, and watch the credits start rolling.
        </p>
        <div className="flex justify-center gap-3 mt-7">
          <Link to="/signup">
            <Button size="lg">Create family — free</Button>
          </Link>
          <Link to="/login">
            <Button variant="secondary" size="lg">Sign in</Button>
          </Link>
        </div>
      </section>

      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} ChoreChamps · Built for families who'd rather be playing.
      </footer>
    </div>
  );
}
