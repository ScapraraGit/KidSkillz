import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AvatarConfig, AuthUserDTO } from "@chorechampz/shared";
import { api } from "../lib/api";
import { useAuth } from "../store/auth";
import { Button } from "./ui";
import { KidAvatar } from "./KidAvatar";
import { PETS } from "../lib/pets";

// Curated DiceBear "avataaars" option pools — keeping the choices kid-friendly.
const TOPS = [
  "shortFlat",
  "shortRound",
  "shortWaved",
  "shortCurly",
  "theCaesar",
  "theCaesarAndSidePart",
  "sides",
  "dreads01",
  "dreads02",
  "shaggy",
  "shaggyMullet",
  "frizzle",
  "bigHair",
  "bob",
  "bun",
  "curly",
  "curvy",
  "dreads",
  "frida",
  "fro",
  "froBand",
  "longButNotTooLong",
  "miaWallace",
  "shavedSides",
  "straight01",
  "straight02",
  "straightAndStrand",
  "hat",
  "hijab",
  "turban",
  "winterHat1",
  "winterHat02",
  "winterHat03",
  "winterHat04",
];

const HAIR_COLORS = [
  "a55728",
  "2c1b18",
  "b58143",
  "d6b370",
  "724133",
  "4a312c",
  "f59797",
  "ecdcbf",
  "c93305",
  "e8e1e1",
];

const EYES = [
  "default",
  "happy",
  "wink",
  "winkWacky",
  "surprised",
  "squint",
  "hearts",
  "side",
  "closed",
  "cry",
  "eyeRoll",
  "xDizzy",
];

const EYEBROWS = [
  "default",
  "defaultNatural",
  "flatNatural",
  "raisedExcited",
  "raisedExcitedNatural",
  "sadConcerned",
  "upDown",
  "angry",
  "frownNatural",
  "unibrowNatural",
];

const MOUTHS = [
  "default",
  "smile",
  "twinkle",
  "tongue",
  "serious",
  "eating",
  "grimace",
  "sad",
  "screamOpen",
  "disbelief",
  "concerned",
];

const ACCESSORIES = ["round", "prescription01", "prescription02", "sunglasses", "wayfarers", "kurt"];

const FACIAL_HAIR = ["beardLight", "beardMajestic", "beardMedium", "moustacheFancy", "moustacheMagnum"];

const FACIAL_HAIR_COLORS = ["2c1b18", "724133", "a55728", "b58143", "d6b370", "ecdcbf"];

const CLOTHING = [
  "blazerAndShirt",
  "blazerAndSweater",
  "collarAndSweater",
  "graphicShirt",
  "hoodie",
  "overall",
  "shirtCrewNeck",
  "shirtScoopNeck",
  "shirtVNeck",
];

const CLOTHES_COLORS = [
  "262e33",
  "3c4f5c",
  "65c9ff",
  "5199e4",
  "25557c",
  "929598",
  "a7ffc4",
  "b1e2ff",
  "e6e6e6",
  "ff488e",
  "ff5c5c",
  "ffafb9",
  "ffffb1",
  "ffffff",
];

// DiceBear avataaars skinColor schema requires 6-char hex (not keyword names).
const SKIN_COLORS = ["fd9841", "f8d25c", "ffdbb4", "edb98a", "d08b5b", "ae5d29", "614335"];

const BACKGROUND_COLORS = [
  "b6e3f4",
  "c0aede",
  "d1d4f9",
  "ffd5dc",
  "ffdfbf",
  "fbe0e2",
  "c9eed8",
  "fff1b0",
  "ffe1a8",
  "e0f2fe",
];

type Tab = {
  key: string;
  label: string;
  emoji: string;
};

const TABS: Tab[] = [
  { key: "skin", label: "Skin", emoji: "🧑" },
  { key: "hair", label: "Hair", emoji: "💇" },
  { key: "hairColor", label: "Hair color", emoji: "🎨" },
  { key: "eyes", label: "Eyes", emoji: "👀" },
  { key: "eyebrows", label: "Brows", emoji: "🤨" },
  { key: "mouth", label: "Mouth", emoji: "😀" },
  { key: "accessories", label: "Glasses", emoji: "🤓" },
  { key: "facialHair", label: "Facial hair", emoji: "🧔" },
  { key: "clothing", label: "Outfit", emoji: "👕" },
  { key: "clothesColor", label: "Shirt color", emoji: "🎨" },
  { key: "background", label: "Background", emoji: "🌈" },
  { key: "pet", label: "Pet", emoji: "🐾" },
];

function pickOne<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function randomAvatarConfig(): AvatarConfig {
  const wantsFacialHair = Math.random() < 0.15;
  const wantsAccessories = Math.random() < 0.35;
  const wantsHair = Math.random() < 0.95;
  return {
    top: wantsHair ? [pickOne(TOPS)] : [],
    topProbability: wantsHair ? 100 : 0,
    hairColor: [pickOne(HAIR_COLORS)],
    eyes: [pickOne(EYES)],
    eyebrows: [pickOne(EYEBROWS)],
    mouth: [pickOne(MOUTHS)],
    skinColor: [pickOne(SKIN_COLORS)],
    accessories: wantsAccessories ? [pickOne(ACCESSORIES)] : [],
    accessoriesProbability: wantsAccessories ? 100 : 0,
    facialHair: wantsFacialHair ? [pickOne(FACIAL_HAIR)] : [],
    facialHairProbability: wantsFacialHair ? 100 : 0,
    facialHairColor: [pickOne(FACIAL_HAIR_COLORS)],
    clothing: [pickOne(CLOTHING)],
    clothesColor: [pickOne(CLOTHES_COLORS)],
    backgroundColor: [pickOne(BACKGROUND_COLORS)],
  };
}

export function defaultAvatarConfig(): AvatarConfig {
  return {
    top: ["shortFlat"],
    topProbability: 100,
    hairColor: ["2c1b18"],
    eyes: ["happy"],
    eyebrows: ["default"],
    mouth: ["smile"],
    skinColor: ["edb98a"],
    accessoriesProbability: 0,
    facialHairProbability: 0,
    clothing: ["hoodie"],
    clothesColor: ["65c9ff"],
    backgroundColor: ["b6e3f4"],
  };
}

interface AvatarStudioTarget {
  id: string; // user id (for parents editing a child) — informational only
  name: string;
  avatarColor?: string;
  avatarConfig?: AvatarConfig | null;
}

interface AvatarStudioProps {
  user: AvatarStudioTarget;
  /** If set, saves to /children/:id (parent edits a kid). Otherwise saves to /auth/me/avatar (self-edit). */
  childId?: string;
  onClose: () => void;
  onSaved?: () => void;
}

export function AvatarStudio({ user, childId, onClose, onSaved }: AvatarStudioProps) {
  const setUser = useAuth((s) => s.setUser);
  const authedUserId = useAuth((s) => s.user?.id);
  const qc = useQueryClient();
  const [config, setConfig] = useState<AvatarConfig>(() => user.avatarConfig ?? defaultAvatarConfig());
  const [tab, setTab] = useState<string>("skin");

  const save = useMutation({
    mutationFn: async () => {
      if (childId) {
        return api<{ child: unknown }>(`/children/${childId}`, {
          method: "PATCH",
          body: { avatarConfig: config },
        });
      }
      return api<{ user: AuthUserDTO }>("/auth/me/avatar", {
        method: "PATCH",
        body: { avatarConfig: config },
      });
    },
    onSuccess: (r: any) => {
      // If editing self, refresh auth store.
      if (!childId && r?.user) setUser(r.user);
      // If a parent edited their own kid, also refresh auth store when ids match (rare path).
      if (childId && childId === authedUserId && r?.child?.avatarConfig !== undefined) {
        // No-op: parents editing themselves goes through /me; this branch defensive only.
      }
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["children"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onSaved?.();
      onClose();
    },
  });

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[92vh] bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">✨</span>
            <div>
              <h2 className="font-bold text-lg">Design your avatar</h2>
              <p className="text-xs text-slate-500">Make it yours, {user.name}!</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Close">
            ✕
          </button>
        </header>

        <div className="grid sm:grid-cols-[200px,1fr] gap-4 p-5 overflow-hidden flex-1 min-h-0">
          {/* Preview */}
          <div className="flex flex-col items-center gap-3">
            <div className="w-40 h-40 sm:w-44 sm:h-44">
              <KidAvatar name={user.name} color={user.avatarColor} config={config} size={176} />
            </div>
            <Button variant="secondary" onClick={() => setConfig(randomAvatarConfig())} className="w-full">
              🎲 Randomize
            </Button>
            <Button variant="ghost" onClick={() => setConfig(defaultAvatarConfig())} className="w-full">
              Reset
            </Button>
          </div>

          {/* Picker */}
          <div className="flex flex-col min-h-0">
            <div className="flex flex-wrap gap-1 mb-3">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={
                    "px-3 py-1.5 rounded-full text-sm font-medium transition " +
                    (tab === t.key
                      ? "bg-brand-600 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200")
                  }
                >
                  <span className="mr-1">{t.emoji}</span>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="overflow-y-auto flex-1 pr-1">
              <OptionGrid tab={tab} config={config} name={user.name} onChange={setConfig} />
            </div>
          </div>
        </div>

        <footer className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save avatar"}
          </Button>
        </footer>
      </div>
    </div>
  );
}

interface OptionGridProps {
  tab: string;
  config: AvatarConfig;
  name: string;
  onChange: (next: AvatarConfig) => void;
}

function OptionGrid({ tab, config, name, onChange }: OptionGridProps) {
  switch (tab) {
    case "skin":
      return (
        <SwatchPicker
          name={name}
          config={config}
          field="skinColor"
          options={SKIN_COLORS.map((v) => ({ value: v, swatch: `#${v}` }))}
          onChange={onChange}
        />
      );
    case "hair":
      return (
        <PreviewPicker
          name={name}
          config={config}
          field="top"
          options={TOPS}
          includeNone
          noneLabel="Bald"
          probabilityField="topProbability"
          onChange={onChange}
        />
      );
    case "hairColor":
      return (
        <SwatchPicker
          name={name}
          config={config}
          field="hairColor"
          options={HAIR_COLORS.map((v) => ({ value: v, swatch: `#${v}` }))}
          onChange={onChange}
        />
      );
    case "eyes":
      return <PreviewPicker name={name} config={config} field="eyes" options={EYES} onChange={onChange} />;
    case "eyebrows":
      return (
        <PreviewPicker name={name} config={config} field="eyebrows" options={EYEBROWS} onChange={onChange} />
      );
    case "mouth":
      return <PreviewPicker name={name} config={config} field="mouth" options={MOUTHS} onChange={onChange} />;
    case "accessories":
      return (
        <PreviewPicker
          name={name}
          config={config}
          field="accessories"
          options={ACCESSORIES}
          includeNone
          probabilityField="accessoriesProbability"
          onChange={onChange}
        />
      );
    case "facialHair":
      return (
        <PreviewPicker
          name={name}
          config={config}
          field="facialHair"
          options={FACIAL_HAIR}
          includeNone
          probabilityField="facialHairProbability"
          onChange={onChange}
        />
      );
    case "clothing":
      return (
        <PreviewPicker name={name} config={config} field="clothing" options={CLOTHING} onChange={onChange} />
      );
    case "clothesColor":
      return (
        <SwatchPicker
          name={name}
          config={config}
          field="clothesColor"
          options={CLOTHES_COLORS.map((v) => ({ value: v, swatch: `#${v}` }))}
          onChange={onChange}
        />
      );
    case "background":
      return (
        <SwatchPicker
          name={name}
          config={config}
          field="backgroundColor"
          options={BACKGROUND_COLORS.map((v) => ({ value: v, swatch: `#${v}` }))}
          onChange={onChange}
        />
      );
    case "pet":
      return <PetPicker config={config} onChange={onChange} />;
    default:
      return null;
  }
}

function PetPicker({ config, onChange }: { config: AvatarConfig; onChange: (next: AvatarConfig) => void }) {
  const current = config.pet;
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
      <button
        onClick={() => {
          const next: AvatarConfig = { ...config };
          delete next.pet;
          onChange(next);
        }}
        className={
          "rounded-xl p-3 flex flex-col items-center gap-1 border-2 transition " +
          (!current ? "border-brand-500 bg-brand-50" : "border-transparent hover:bg-slate-100")
        }
      >
        <span className="text-3xl">🚫</span>
        <span className="text-[10px] text-slate-500">None</span>
      </button>
      {PETS.map((p) => {
        const selected = current === p.id;
        return (
          <button
            key={p.id}
            onClick={() => onChange({ ...config, pet: p.id })}
            className={
              "rounded-xl p-3 flex flex-col items-center gap-1 border-2 transition " +
              (selected ? "border-brand-500 bg-brand-50" : "border-transparent hover:bg-slate-100")
            }
          >
            <span className="text-3xl">{p.stages[2]}</span>
            <span className="text-[10px] text-slate-500">{p.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function PreviewPicker({
  name,
  config,
  field,
  options,
  includeNone,
  noneLabel,
  probabilityField,
  onChange,
}: {
  name: string;
  config: AvatarConfig;
  field: "top" | "eyes" | "eyebrows" | "mouth" | "accessories" | "facialHair" | "clothing";
  options: string[];
  includeNone?: boolean;
  noneLabel?: string;
  probabilityField?: "accessoriesProbability" | "facialHairProbability" | "topProbability";
  onChange: (next: AvatarConfig) => void;
}) {
  const current = (config as any)[field]?.[0] as string | undefined;
  const probabilityOff = probabilityField ? config[probabilityField] === 0 : false;
  const items = useMemo(() => (includeNone ? ["__none__", ...options] : options), [includeNone, options]);

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
      {items.map((opt) => {
        const isNone = opt === "__none__";
        const selected = isNone ? probabilityOff : !probabilityOff && current === opt;
        const previewConfig: AvatarConfig = {
          ...config,
          [field]: isNone ? [] : [opt],
          ...(probabilityField && { [probabilityField]: isNone ? 0 : 100 }),
        } as AvatarConfig;

        return (
          <button
            key={opt}
            onClick={() => {
              const next: AvatarConfig = {
                ...config,
                [field]: isNone ? [] : [opt],
              } as AvatarConfig;
              if (probabilityField) (next as any)[probabilityField] = isNone ? 0 : 100;
              onChange(next);
            }}
            className={
              "rounded-xl p-2 flex flex-col items-center gap-1 border-2 transition " +
              (selected ? "border-brand-500 bg-brand-50" : "border-transparent hover:bg-slate-100")
            }
          >
            <KidAvatar name={name} config={previewConfig} size={64} />
            <span className="text-[10px] text-slate-500 truncate w-full text-center">
              {isNone ? (noneLabel ?? "None") : prettyLabel(opt)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SwatchPicker({
  name: _name,
  config,
  field,
  options,
  onChange,
}: {
  name: string;
  config: AvatarConfig;
  field: "skinColor" | "hairColor" | "clothesColor" | "backgroundColor";
  options: { value: string; swatch: string }[];
  onChange: (next: AvatarConfig) => void;
}) {
  const current = (config as any)[field]?.[0] as string | undefined;
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(({ value, swatch }) => {
        const selected = current === value;
        return (
          <button
            key={value}
            onClick={() => onChange({ ...config, [field]: [value] } as AvatarConfig)}
            className={
              "w-12 h-12 rounded-full border-2 transition " +
              (selected
                ? "border-brand-600 ring-2 ring-brand-200"
                : "border-slate-200 hover:border-slate-400")
            }
            style={{ backgroundColor: swatch }}
            aria-label={value}
            title={value}
          />
        );
      })}
    </div>
  );
}

function prettyLabel(s: string): string {
  return s
    .replace(/([A-Z0-9]+)/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();
}
