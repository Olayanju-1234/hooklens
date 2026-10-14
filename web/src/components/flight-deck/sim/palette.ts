import type { Tone } from "./engine";

// Day-chart state colours; mirrors the --s-* tokens in globals.css. Every hue is a state, never decoration.
export const CHART: Record<Tone, string> = {
  white: "#3a4246",
  cyan: "#0b6a86",
  green: "#11804a",
  amber: "#9a5a00",
  red: "#c2281f",
  orange: "#c24600",
  magenta: "#a8128a",
};

export const INK = "#131619";
export const PAPER = "#f4f5f2";

export function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
