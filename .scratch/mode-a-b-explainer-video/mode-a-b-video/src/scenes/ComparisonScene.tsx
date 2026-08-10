import React from "react";
import {
  AbsoluteFill,
  Interactive,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { fontFamily, theme } from "../theme";
import { fadeUp, SceneHeading } from "../components";

const rows: { label: string; a: string; b: string }[] = [
  { label: "Ingestion", a: "LMS watcher", b: "Direct upload API" },
  { label: "Identity", a: "Borrowed from LMS", b: "Own accounts" },
  { label: "UI", a: "None — background agent", b: "Teacher + student app" },
  { label: "Origin", a: "LMS storage", b: "Our storage" },
];

const Cell: React.FC<{
  text: string;
  accent?: string;
  align: "left" | "center" | "right";
  delay: number;
  name: string;
}> = ({ text, accent, align, delay, name }) => {
  const frame = useCurrentFrame();
  return (
    <Interactive.Div
      name={name}
      style={{
        fontFamily,
        fontSize: 30,
        fontWeight: accent ? 700 : 400,
        color: accent ?? theme.text,
        textAlign: align,
        ...fadeUp(frame, delay, 30),
      }}
    >
      {text}
    </Interactive.Div>
  );
};

export const ComparisonScene: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      name="Comparison"
      style={{
        backgroundColor: theme.bg,
        padding: "100px 140px",
        display: "flex",
        flexDirection: "column",
        gap: 56,
      }}
    >
      <SceneHeading
        name="comparison"
        kicker="what actually changes"
        kickerColor={theme.text}
        title="Same engine underneath."
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1.4fr 1.4fr",
          rowGap: 36,
          columnGap: 24,
          background: theme.panel,
          border: `1px solid ${theme.border}`,
          borderRadius: 20,
          padding: "40px 48px",
        }}
      >
        <div />
        <div
          style={{
            fontFamily,
            fontSize: 30,
            fontWeight: 800,
            color: theme.modeA,
          }}
        >
          Mode A
        </div>
        <div
          style={{
            fontFamily,
            fontSize: 30,
            fontWeight: 800,
            color: theme.modeB,
          }}
        >
          Mode B
        </div>

        {rows.map((row, i) => (
          <React.Fragment key={row.label}>
            <Cell
              name={`row-${i}-label`}
              text={row.label}
              accent={theme.muted}
              align="left"
              delay={0.3 * fps + i * 0.35 * fps}
            />
            <Cell
              name={`row-${i}-a`}
              text={row.a}
              align="left"
              delay={0.3 * fps + i * 0.35 * fps}
            />
            <Cell
              name={`row-${i}-b`}
              text={row.b}
              align="left"
              delay={0.3 * fps + i * 0.35 * fps}
            />
          </React.Fragment>
        ))}
      </div>
    </AbsoluteFill>
  );
};
