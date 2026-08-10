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

export const OutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      name="Outro"
      style={{
        backgroundColor: theme.bg,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
      }}
    >
      <Interactive.Div
        name="OutroLine"
        style={{
          fontFamily,
          fontSize: 56,
          fontWeight: 800,
          color: theme.text,
          textAlign: "center",
          opacity: interpolate(frame, [0, 0.5 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(...EASE_OUT),
          }),
          translate: interpolate(
            frame,
            [0, 0.5 * fps],
            ["0px 16px", "0px 0px"],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(...EASE_OUT),
            },
          ),
        }}
      >
        One engine. Two ways to deliver.
      </Interactive.Div>
      <Interactive.Div
        name="OutroWordmark"
        style={{
          fontFamily,
          fontSize: 34,
          fontWeight: 600,
          color: theme.engine,
          opacity: interpolate(frame, [0.7 * fps, 1.2 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(...EASE_OUT),
          }),
        }}
      >
        campvus
      </Interactive.Div>
    </AbsoluteFill>
  );
};
