import "./index.css";
import { Composition, Folder } from "remotion";
import { MainVideo, MAIN_VIDEO_DURATION, SCENE_DURATIONS } from "./MainVideo";
import { TitleScene } from "./scenes/TitleScene";
import { ProblemScene } from "./scenes/ProblemScene";
import { SharedEngineScene } from "./scenes/SharedEngineScene";
import { ModeAScene } from "./scenes/ModeAScene";
import { ModeBScene } from "./scenes/ModeBScene";
import { ComparisonScene } from "./scenes/ComparisonScene";
import { OutroScene } from "./scenes/OutroScene";

const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 30;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="ModeAModeBExplainer"
        component={MainVideo}
        durationInFrames={MAIN_VIDEO_DURATION}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Folder name="Scenes">
        <Composition
          id="Scene-Title"
          component={TitleScene}
          durationInFrames={SCENE_DURATIONS.title}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
        />
        <Composition
          id="Scene-Problem"
          component={ProblemScene}
          durationInFrames={SCENE_DURATIONS.problem}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
        />
        <Composition
          id="Scene-SharedEngine"
          component={SharedEngineScene}
          durationInFrames={SCENE_DURATIONS.sharedEngine}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
        />
        <Composition
          id="Scene-ModeA"
          component={ModeAScene}
          durationInFrames={SCENE_DURATIONS.modeA}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
        />
        <Composition
          id="Scene-ModeB"
          component={ModeBScene}
          durationInFrames={SCENE_DURATIONS.modeB}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
        />
        <Composition
          id="Scene-Comparison"
          component={ComparisonScene}
          durationInFrames={SCENE_DURATIONS.comparison}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
        />
        <Composition
          id="Scene-Outro"
          component={OutroScene}
          durationInFrames={SCENE_DURATIONS.outro}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
        />
      </Folder>
    </>
  );
};
