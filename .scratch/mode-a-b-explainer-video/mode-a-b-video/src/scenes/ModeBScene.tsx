import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";
import { Card, SceneHeading } from "../components";

export const ModeBScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      name="ModeB"
      style={{
        backgroundColor: theme.bg,
        padding: "100px 140px",
        display: "flex",
        flexDirection: "column",
        gap: 56,
      }}
    >
      <SceneHeading
        name="mode-b"
        kicker="mode b — full app"
        kickerColor={theme.modeB}
        title={"No LMS to sit beside?\nWe deploy both ends."}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 28,
        }}
      >
        <Card
          name="b-ingestion"
          label="Ingestion"
          detail="A teacher's upload through our own UI is the ingestion event — no watcher needed."
          accent={theme.modeB}
          delay={0.4 * fps}
        />
        <Card
          name="b-identity"
          label="Identity"
          detail="We own accounts, rosters and access control — new work Mode A gets for free."
          accent={theme.modeB}
          delay={0.7 * fps}
        />
        <Card
          name="b-ui"
          label="Student + teacher UI"
          detail="Full upload, browse, download and sync-status screens for both audiences."
          accent={theme.modeB}
          delay={1.0 * fps}
        />
        <Card
          name="b-origin"
          label="Origin fallback"
          detail="Our own storage becomes the always-works tier instead of the LMS's."
          accent={theme.modeB}
          delay={1.3 * fps}
        />
      </div>
    </AbsoluteFill>
  );
};
