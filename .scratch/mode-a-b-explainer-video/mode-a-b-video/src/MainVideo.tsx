import React from "react";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { TitleScene } from "./scenes/TitleScene";
import { ProblemScene } from "./scenes/ProblemScene";
import { SharedEngineScene } from "./scenes/SharedEngineScene";
import { ModeAScene } from "./scenes/ModeAScene";
import { ModeBScene } from "./scenes/ModeBScene";
import { ComparisonScene } from "./scenes/ComparisonScene";
import { OutroScene } from "./scenes/OutroScene";

export const SCENE_DURATIONS = {
  title: 90,
  problem: 150,
  sharedEngine: 180,
  modeA: 210,
  modeB: 210,
  comparison: 180,
  outro: 120,
} as const;

const TRANSITION_FRAMES = 15;
const TRANSITION_COUNT = 6;

export const MAIN_VIDEO_DURATION =
  Object.values(SCENE_DURATIONS).reduce((a, b) => a + b, 0) -
  TRANSITION_FRAMES * TRANSITION_COUNT;

const transition = () => (
  <TransitionSeries.Transition
    presentation={fade()}
    timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
  />
);

export const MainVideo: React.FC = () => {
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence
        durationInFrames={SCENE_DURATIONS.title}
        name="Title"
      >
        <TitleScene />
      </TransitionSeries.Sequence>
      {transition()}
      <TransitionSeries.Sequence
        durationInFrames={SCENE_DURATIONS.problem}
        name="Problem"
      >
        <ProblemScene />
      </TransitionSeries.Sequence>
      {transition()}
      <TransitionSeries.Sequence
        durationInFrames={SCENE_DURATIONS.sharedEngine}
        name="SharedEngine"
      >
        <SharedEngineScene />
      </TransitionSeries.Sequence>
      {transition()}
      <TransitionSeries.Sequence
        durationInFrames={SCENE_DURATIONS.modeA}
        name="ModeA"
      >
        <ModeAScene />
      </TransitionSeries.Sequence>
      {transition()}
      <TransitionSeries.Sequence
        durationInFrames={SCENE_DURATIONS.modeB}
        name="ModeB"
      >
        <ModeBScene />
      </TransitionSeries.Sequence>
      {transition()}
      <TransitionSeries.Sequence
        durationInFrames={SCENE_DURATIONS.comparison}
        name="Comparison"
      >
        <ComparisonScene />
      </TransitionSeries.Sequence>
      {transition()}
      <TransitionSeries.Sequence
        durationInFrames={SCENE_DURATIONS.outro}
        name="Outro"
      >
        <OutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
};
