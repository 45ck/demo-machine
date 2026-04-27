import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import type { DemoCompositionProps } from "./lib/types.js";
import { Background } from "./components/Background.js";
import { NarrationAudio } from "./components/NarrationAudio.js";

export const DemoComposition: React.FC<DemoCompositionProps> = ({
  specTitle: _specTitle,
  videoSrc,
  audioSrc,
  videoStartMs,
}) => {
  const { fps } = useVideoConfig();
  const startFrom =
    videoStartMs !== undefined ? Math.max(0, Math.round((videoStartMs / 1000) * fps)) : undefined;

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <Background src={videoSrc} startFrom={startFrom} />
      {audioSrc && <NarrationAudio src={audioSrc} />}
    </AbsoluteFill>
  );
};
