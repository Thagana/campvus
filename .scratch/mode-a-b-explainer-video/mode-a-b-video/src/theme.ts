import { loadFont } from "@remotion/google-fonts/Inter";

export const { fontFamily } = loadFont("normal", {
  weights: ["400", "600", "800"],
  subsets: ["latin"],
});

export const theme = {
  bg: "#0B0F1A",
  bgSoft: "#111827",
  panel: "#161D2E",
  border: "#232B3D",
  text: "#F1F5F9",
  muted: "#8B96AA",
  engine: "#38BDF8",
  modeA: "#A78BFA",
  modeB: "#FB923C",
  danger: "#F87171",
} as const;

export const EASE_OUT = [0.16, 1, 0.3, 1] as const;
