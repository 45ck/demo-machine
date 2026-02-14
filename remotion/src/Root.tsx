import React from "react";
import { Composition } from "remotion";
import { DemoComposition } from "./DemoComposition.js";
import { calculateMetadata } from "./lib/calculate-metadata.js";
import type { DemoCompositionProps } from "./lib/types.js";

const defaultProps: DemoCompositionProps = {
  specTitle: "Demo Video",
  videoSrc: "",
  resolution: { width: 1920, height: 1080 },
  fps: 30,
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="DemoVideo"
      component={DemoComposition}
      calculateMetadata={calculateMetadata}
      defaultProps={defaultProps}
      width={1920}
      height={1080}
      fps={30}
      durationInFrames={300}
    />
  );
};
