import type { Tone } from "./engine";

// Flight-deck colour convention: every hue is a state, never decoration.
export const NIGHT: Record<Tone, string> = {
  white: "#ECEAE2",
  cyan: "#4FD8E8",
  green: "#5BE38A",
  amber: "#FFB21A",
  red: "#FF5247",
  orange: "#FF6A13",
  magenta: "#FF4FD8",
};

export const DAY: Record<Tone, string> = {
  white: "#1B1D1B",
  cyan: "#0A7A8A",
  green: "#13804A",
  amber: "#A35F00",
  red: "#C42B21",
  orange: "#CC4700",
  magenta: "#B0168F",
};

export function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
