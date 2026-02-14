import React from "react";
import { AbsoluteFill } from "remotion";
import type { DemoCompositionProps } from "./lib/types.js";
import { Background } from "./components/Background.js";
import { NarrationAudio } from "./components/NarrationAudio.js";

export const DemoComposition: React.FC<DemoCompositionProps> = ({
  specTitle: _specTitle,
  videoSrc,
  audioSrc,
}) => {
  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <Background src={videoSrc} />
      {audioSrc && <NarrationAudio src={audioSrc} />}
    </AbsoluteFill>
  );
};
