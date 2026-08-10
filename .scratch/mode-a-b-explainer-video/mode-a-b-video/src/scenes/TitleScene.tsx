import React from "react";
import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { EASE_OUT, fontFamily, theme } from "../theme";

export const TitleScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      name="Title"
      style={{
        backgroundColor: theme.bg,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 28,
      }}
    >
      <Interactive.Div
        name="Wordmark"
        style={{
          fontFamily,
          fontSize: 140,
          fontWeight: 800,
          color: theme.text,
          letterSpacing: -2,
          scale: interpolate(frame, [0, 0.6 * fps], [0.92, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.spring({ damping: 200 }),
            output: "perceptual-scale",
          }),
          opacity: interpolate(frame, [0, 0.5 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(...EASE_OUT),
          }),
        }}
      >
        campvus
      </Interactive.Div>
      <Interactive.Div
        name="Tagline"
        style={{
          fontFamily,
          fontSize: 40,
          fontWeight: 400,
          color: theme.engine,
          opacity: interpolate(
            frame,
            [0.8 * fps, 1.3 * fps],
            [0, 1],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(...EASE_OUT),
            },
          ),
          translate: interpolate(
            frame,
            [0.8 * fps, 1.3 * fps],
            ["0px 12px", "0px 0px"],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(...EASE_OUT),
            },
          ),
        }}
      >
        one engine, two ways to deliver
      </Interactive.Div>
    </AbsoluteFill>
  );
};
