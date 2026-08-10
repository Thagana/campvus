import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";
import { Card, SceneHeading } from "../components";

export const ModeAScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      name="ModeA"
      style={{
        backgroundColor: theme.bg,
        padding: "100px 140px",
        display: "flex",
        flexDirection: "column",
        gap: 56,
      }}
    >
      <SceneHeading
        name="mode-a"
        kicker="mode a — headless"
        kickerColor={theme.modeA}
        title={"Sits beside the LMS.\nWe own no student surface."}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 28,
        }}
      >
        <Card
          name="a-ingestion"
          label="Ingestion"
          detail="An LMS watcher detects new uploads — teachers keep using the LMS exactly as today."
          accent={theme.modeA}
          delay={0.4 * fps}
        />
        <Card
          name="a-identity"
          label="Identity"
          detail="Enrollment is borrowed from the LMS's own API — we never own accounts."
          accent={theme.modeA}
          delay={0.7 * fps}
        />
        <Card
          name="a-ui"
          label="Student surface"
          detail="No UI of ours. An invisible background agent just makes bytes arrive from a peer."
          accent={theme.modeA}
          delay={1.0 * fps}
        />
        <Card
          name="a-origin"
          label="Origin fallback"
          detail="The LMS's own file storage — we're a faster path, never the source of truth."
          accent={theme.modeA}
          delay={1.3 * fps}
        />
      </div>
    </AbsoluteFill>
  );
};
