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
import { fadeUp, SceneHeading } from "../components";

const Student: React.FC<{ index: number; delay: number }> = ({
  index,
  delay,
}) => {
  const frame = useCurrentFrame();
  const local = Math.max(0, frame - delay);
  const dropY = interpolate(local, [0, 18], [-30, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(...EASE_OUT),
  });
  const opacity = interpolate(local, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const costOpacity = interpolate(local, [16, 26], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 18,
        width: 220,
      }}
    >
      <div
        style={{
          width: 2,
          height: 90,
          background: theme.border,
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: -1,
            width: 2,
            height: interpolate(local, [0, 20], [0, 90], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            background: theme.danger,
          }}
        />
      </div>
      <div
        style={{
          transform: `translateY(${dropY}px)`,
          opacity,
          width: 140,
          height: 90,
          borderRadius: 14,
          border: `2px solid ${theme.border}`,
          background: theme.panel,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily,
          fontSize: 22,
          color: theme.muted,
        }}
      >
        student {index}
      </div>
      <div
        style={{
          fontFamily,
          fontSize: 28,
          fontWeight: 700,
          color: theme.danger,
          opacity: costOpacity,
        }}
      >
        full download
      </div>
    </div>
  );
};

export const ProblemScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      name="Problem"
      style={{
        backgroundColor: theme.bg,
        padding: "100px 140px",
        display: "flex",
        flexDirection: "column",
        gap: 64,
      }}
    >
      <SceneHeading
        name="problem"
        kicker="the problem"
        kickerColor={theme.danger}
        title={"Same file. Same dorm.\nPaid for three times."}
      />

      <Interactive.Div
        name="OriginBar"
        style={{
          alignSelf: "center",
          fontFamily,
          fontSize: 30,
          fontWeight: 600,
          color: theme.text,
          background: theme.bgSoft,
          border: `1px solid ${theme.border}`,
          borderRadius: 999,
          padding: "16px 40px",
          ...fadeUp(frame, 8, fps),
        }}
      >
        course server
      </Interactive.Div>

      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: 70,
        }}
      >
        <Student index={1} delay={0.6 * fps} />
        <Student index={2} delay={0.85 * fps} />
        <Student index={3} delay={1.1 * fps} />
      </div>
    </AbsoluteFill>
  );
};
