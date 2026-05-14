import { useMemo } from "react";
import { createAvatar } from "@dicebear/core";
import { avataaars } from "@dicebear/collection";
import type { AvatarConfig } from "@chorechampz/shared";
import { Avatar } from "./ui";

interface KidAvatarProps {
  name: string;
  color?: string;
  config?: AvatarConfig | null;
  size?: number;
  className?: string;
}

export function KidAvatar({ name, color, config, size = 40, className }: KidAvatarProps) {
  const svg = useMemo(() => buildAvatarSvg(name, config), [name, config]);

  if (!svg) {
    return <Avatar name={name} color={color} size={size} />;
  }

  return (
    <div
      className={
        "rounded-full overflow-hidden shrink-0 ring-1 ring-slate-200 bg-white [&>svg]:w-full [&>svg]:h-full [&>svg]:block " +
        (className ?? "")
      }
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${name}'s avatar`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export function buildAvatarSvg(seed: string, config?: AvatarConfig | null): string | null {
  if (!config) return null;
  try {
    return createAvatar(avataaars, {
      seed,
      ...(config as object),
      // make the SVG fill the container
      size: 128,
    }).toString();
  } catch {
    return null;
  }
}
