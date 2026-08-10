import React from "react";
import { Easing, interpolate, Interactive, useCurrentFrame } from "remotion";
import { EASE_OUT, fontFamily, theme } from "./theme";

export const fadeUp = (frame: number, start: number, fps: number) =>
  ({
    opacity: interpolate(frame, [start, start + 0.5 * fps], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(...EASE_OUT),
    }),
    translate: interpolate(
      frame,
      [start, start + 0.5 * fps],
      ["24px 0px", "0px 0px"],
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.bezier(...EASE_OUT),
      },
    ),
  }) as const;

export const Kicker: React.FC<{ children: React.ReactNode; color: string }> = ({
  children,
  color,
}) => (
  <div
    style={{
      fontFamily,
      fontSize: 30,
      fontWeight: 600,
      letterSpacing: 4,
      textTransform: "uppercase",
      color,
    }}
  >
    {children}
  </div>
);

export const SceneHeading: React.FC<{
  kicker?: string;
  kickerColor?: string;
  title: string;
  name: string;
}> = ({ kicker, kickerColor = theme.engine, title, name }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {kicker ? (
        <Interactive.Div name={`${name}-kicker`} style={fadeUp(frame, 0, 30)}>
          <Kicker color={kickerColor}>{kicker}</Kicker>
        </Interactive.Div>
      ) : null}
      <Interactive.Div
        name={`${name}-title`}
        style={{
          fontFamily,
          fontSize: 84,
          fontWeight: 800,
          color: theme.text,
          lineHeight: 1.05,
          whiteSpace: "pre-line",
          ...fadeUp(frame, 6, 30),
        }}
      >
        {title}
      </Interactive.Div>
    </div>
  );
};

export const Card: React.FC<{
  label: string;
  detail: string;
  accent: string;
  delay: number;
  name: string;
}> = ({ label, detail, accent, delay, name }) => {
  const frame = useCurrentFrame();
  return (
    <Interactive.Div
      name={name}
      style={{
        background: theme.panel,
        border: `1px solid ${theme.border}`,
        borderLeft: `6px solid ${accent}`,
        borderRadius: 16,
        padding: "28px 32px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        ...fadeUp(frame, delay, 30),
      }}
    >
      <div
        style={{
          fontFamily,
          fontSize: 34,
          fontWeight: 700,
          color: theme.text,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily,
          fontSize: 26,
          fontWeight: 400,
          color: theme.muted,
        }}
      >
        {detail}
      </div>
    </Interactive.Div>
  );
};

export const ArrowRight: React.FC<{ color?: string; size?: number }> = ({
  color = theme.muted,
  size = 40,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path
      d="M4 12H20M20 12L14 6M20 12L14 18"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
