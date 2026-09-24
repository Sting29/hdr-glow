import type { RGB } from "./mask";

/** Upper bound on the glow color list: past this the mask gets slow to compute and the chip row gets unreadable. */
export const MAX_GLOW_COLORS = 12;

export const toHex = ({ r, g, b }: RGB) =>
  `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;

export const sameColor = (a: RGB, b: RGB) => a.r === b.r && a.g === b.g && a.b === b.b;

/** Accepts "#fff", "fff", "#ffffff" or "ffffff"; null if it isn't a valid color. */
export const parseHex = (value: string): RGB | null => {
  const trimmed = value.trim().replace(/^#/, "");
  const expanded = trimmed.length === 3 ? trimmed.replace(/./g, (char) => char + char) : trimmed;
  if (!/^[0-9a-f]{6}$/i.test(expanded)) return null;
  return {
    r: parseInt(expanded.slice(0, 2), 16),
    g: parseInt(expanded.slice(2, 4), 16),
    b: parseInt(expanded.slice(4, 6), 16),
  };
};

/**
 * Adds a color to a list, deduping by value and capping at MAX_GLOW_COLORS.
 * Returns the same list reference when nothing changed, so a caller can tell
 * a no-op apart from a real addition (e.g. to tell "already there" from "list is full").
 */
export const addGlowColor = (list: RGB[], color: RGB): RGB[] => {
  if (list.some((c) => sameColor(c, color))) return list;
  if (list.length >= MAX_GLOW_COLORS) return list;
  return [...list, color];
};
