import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { fontFamily, theme } from "../theme";
import { ArrowRight, fadeUp, SceneHeading } from "../components";
import { useCurrentFrame, Interactive } from "remotion";

const steps = [
  { label: "hash", detail: "content-addressed" },
  { label: "sign", detail: "Ed25519, institution key" },
  { label: "publish", detail: "signed manifest" },
  { label: "swarm", detail: "peers gossip + seed" },
];

export const SharedEngineScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      name="SharedEngine"
      style={{
        backgroundColor: theme.bg,
        padding: "100px 140px",
        display: "flex",
        flexDirection: "column",
        gap: 90,
      }}
    >
      <SceneHeading
        name="engine"
        kicker="one engine, built once"
        kickerColor={theme.engine}
        title={"Hashing. Signing.\nSwarm distribution."}
      />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
        }}
      >
        {steps.map((step, i) => (
          <React.Fragment key={step.label}>
            <Interactive.Div
              name={`step-${step.label}`}
              style={{
                background: theme.panel,
                border: `2px solid ${theme.engine}`,
                borderRadius: 20,
                padding: "36px 40px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 10,
                width: 260,
                ...fadeUp(frame, 0.5 * fps + i * 0.3 * fps, fps),
              }}
            >
              <div
                style={{
                  fontFamily,
                  fontSize: 38,
                  fontWeight: 800,
                  color: theme.text,
                  textTransform: "capitalize",
                }}
              >
                {step.label}
              </div>
              <div
                style={{
                  fontFamily,
                  fontSize: 22,
                  color: theme.muted,
                  textAlign: "center",
                }}
              >
                {step.detail}
              </div>
            </Interactive.Div>
            {i < steps.length - 1 ? (
              <Interactive.Div
                name={`arrow-${i}`}
                style={fadeUp(frame, 0.5 * fps + i * 0.3 * fps + 8, fps)}
              >
                <ArrowRight color={theme.engine} size={44} />
              </Interactive.Div>
            ) : null}
          </React.Fragment>
        ))}
      </div>

      <Interactive.Div
        name="engine-footnote"
        style={{
          alignSelf: "center",
          fontFamily,
          fontSize: 28,
          color: theme.muted,
          ...fadeUp(frame, 2.1 * fps, fps),
        }}
      >
        Mode A and Mode B both call straight into this pipeline.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
