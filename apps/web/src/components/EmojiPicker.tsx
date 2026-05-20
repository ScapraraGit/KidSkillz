import { useRef, useState } from "react";
import { Popover } from "./Popover";
import { Tooltip } from "./Tooltip";

// Curated emoji set for task-category icons. Kept small so kids can recognize
// each one at a glance; allows custom paste via the text input at the bottom.
const PRESET_EMOJIS = [
  "🧹",
  "🛏️",
  "🍽️",
  "🪥",
  "🚿",
  "🧺",
  "🧼",
  "🐶",
  "🐱",
  "🌱",
  "🌳",
  "📚",
  "✏️",
  "🎒",
  "🎨",
  "🎵",
  "⚽",
  "🏀",
  "🚴",
  "🛼",
  "🎮",
  "🧩",
  "🍎",
  "🥕",
  "🧁",
  "⭐",
  "❤️",
  "🏆",
  "🔔",
  "🧠",
  "💡",
  "🛠️",
];

interface EmojiPickerProps {
  value: string;
  onChange: (emoji: string) => void;
  label?: string;
}

// Button-shaped trigger that shows the current emoji. Clicking opens a popover
// with a curated grid + a "custom" text input for anything off-grid. Keyboard:
// each grid button is a tabbable <button>; Esc closes via Popover's handler.
export function EmojiPicker({ value, onChange, label = "Pick an icon" }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const anchorRef = useRef<HTMLButtonElement | null>(null);

  function pick(next: string) {
    const clean = next.trim();
    if (!clean) return;
    onChange(clean.slice(0, 4));
    setOpen(false);
    setCustom("");
  }

  return (
    <>
      <Tooltip label={label}>
        <button
          ref={anchorRef}
          type="button"
          aria-label={label}
          onClick={() => setOpen((o) => !o)}
          className="h-10 w-10 rounded-lg border border-slate-300 bg-white text-xl shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          {value || "❓"}
        </button>
      </Tooltip>
      <Popover open={open} onClose={() => setOpen(false)} anchor={anchorRef.current} placement="bottom">
        <div className="w-64">
          <div className="text-xs font-medium text-slate-500 mb-2">Choose an icon</div>
          <div className="grid grid-cols-8 gap-1">
            {PRESET_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => pick(e)}
                className={`h-8 w-8 rounded-md text-lg hover:bg-brand-50 focus:outline-none focus:ring-2 focus:ring-brand-500 ${
                  e === value ? "bg-brand-100 ring-1 ring-brand-300" : ""
                }`}
                aria-label={`Use ${e}`}
              >
                {e}
              </button>
            ))}
          </div>
          <div className="mt-3 border-t border-slate-100 pt-3">
            <label className="block text-xs font-medium text-slate-500 mb-1">Or paste any emoji</label>
            <div className="flex gap-2">
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="e.g. 🦄"
                className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <button
                type="button"
                onClick={() => pick(custom)}
                disabled={!custom.trim()}
                className="rounded-md bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                Use
              </button>
            </div>
          </div>
        </div>
      </Popover>
    </>
  );
}
