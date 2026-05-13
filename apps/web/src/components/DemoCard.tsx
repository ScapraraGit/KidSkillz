export function DemoCard() {
  return (
    <div className="relative">
      <div className="bg-white rounded-3xl shadow-xl border border-slate-200 p-6 rotate-1">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-xl">
            🧒
          </div>
          <div>
            <div className="font-semibold">Ava's day</div>
            <div className="text-xs text-slate-500">🪙 24 credits today</div>
          </div>
        </div>
        <div className="space-y-2">
          {[
            { t: "Make your bed", c: 2, done: true },
            { t: "Practice piano (20 min)", c: 6, done: true },
            { t: "Empty the dishwasher", c: 5, done: false },
            { t: "Clean your room (deep)", c: 15, done: false },
          ].map((row) => (
            <div
              key={row.t}
              className={`flex items-center justify-between rounded-xl px-3 py-2 border ${
                row.done ? "bg-emerald-50 border-emerald-200" : "bg-slate-50 border-slate-200"
              }`}
            >
              <div className="flex items-center gap-2">
                <span>{row.done ? "✅" : "⬜"}</span>
                <span className={row.done ? "text-slate-500 line-through" : "text-slate-800"}>{row.t}</span>
              </div>
              <span className="font-semibold text-slate-700">{row.c} 🪙</span>
            </div>
          ))}
        </div>
      </div>
      <div className="absolute -bottom-6 -left-6 bg-white rounded-2xl shadow-lg border border-slate-200 p-4 -rotate-3 hidden sm:block">
        <div className="text-xs text-slate-500">Reward unlocked</div>
        <div className="font-semibold">🍦 Ice cream after dinner</div>
        <div className="text-xs text-emerald-600 font-semibold mt-1">Approved by Mom</div>
      </div>
    </div>
  );
}
